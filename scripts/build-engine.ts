/**
 * 构建我们自己的引擎(rust/twengine):一个 wasm,给地图预览和 demo 播放两个前端共用。
 *
 * 引擎 = twgpu(渲染) + 自己的 .demo reader(顺带把声音事件抽出来);
 * 产物落在 static/ddnet/engine/:
 *
 *   pkg/twengine.js, pkg/twengine_bg.wasm   wasm 胶水(两个页面都 import 这同一份)
 *   assets/*.png, assets/DejaVuSans.ttf     渲染贴图与字体
 *   assets/mapres_06|07/*.png               地图里没内嵌的图
 *   sounds/sounds.json, sounds/*.opus       音效(从 ddnet 的 .wv 转 opus)
 *   version.json                            前端拼 ?v= 用
 *
 * 依赖:rust(wasm32-unknown-unknown)、wasm-pack、unzip
 * 声音包(sounds.zip)已经提交在仓库里,平时不需要 ffmpeg;要重转才加 `--sounds`。
 *
 * 用法:
 *   bun scripts/build-engine.ts           # 已有产物且源码/上游没动过就跳过
 *   bun scripts/build-engine.ts --force   # 强制重编
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
	copyFileSync
} from 'fs';
import { createHash } from 'crypto';
import path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');
const SUBMODULE = path.join(ROOT, 'vendor/twgpu');
const CRATE = path.join(ROOT, 'rust/twengine');
const OUT = path.join(ROOT, 'static/ddnet/engine');
const CACHE = path.join(ROOT, 'cache/engine');
const STAMP = path.join(OUT, 'version.json');
// 对 submodule 的补丁:给 Samplers 加 mipmap 开关(有些 WebGL 设备用不了 mip 链)
const PATCHES = [path.join(ROOT, 'patches/twgpu-web-fixes.patch')];

const force = process.argv.includes('--force');
/** 重新从 ddnet 的 .wv 转码声音(需要 ffmpeg + 网络),平时用仓库里的 sounds.zip */
const rebuildSounds = process.argv.includes('--sounds');

const DDNET_DATA = 'https://raw.githubusercontent.com/ddnet/ddnet/master/data';
const DDNET_CONTENT = 'https://raw.githubusercontent.com/ddnet/ddnet/master/datasrc/content.py';

/** 渲染器需要的贴图,和 wasm 里 add_texture 认的名字一一对应 */
const TEXTURES: { name: string; file: string; url: string }[] = [
	{ name: 'game', file: 'game.png', url: `${DDNET_DATA}/game.png` },
	{ name: 'particles', file: 'particles.png', url: `${DDNET_DATA}/particles.png` },
	{ name: 'emoticons', file: 'emoticons.png', url: `${DDNET_DATA}/emoticons.png` },
	{ name: 'extras', file: 'extras.png', url: `${DDNET_DATA}/extras.png` },
	{ name: 'default', file: 'default.png', url: `${DDNET_DATA}/skins/default.png` },
	{ name: 'x_ninja', file: 'x_ninja.png', url: `${DDNET_DATA}/skins/x_ninja.png` },
	{ name: 'DejaVuSans.ttf', file: 'DejaVuSans.ttf', url: `${DDNET_DATA}/fonts/DejaVuSans.ttf` }
];

/**
 * 实体层图集,和 wasm 里 `add_entities` 认的 id 一一对应。
 *
 * 客户端用 `cl_assets_entities` 选风格:comfort 是 `assets/entities/comfort/ddnet.png`,
 * 默认那套(default)是 `editor/entities_clear/<gametype>.png`。我们只取**官方 DDNet 那两张**
 * (`ddnet.png`),不按 gametype 拆 —— 两张都是 1024x1024、16x16 个 64px tile,转换逻辑完全一样,
 * 所以 wasm 里只需要「传哪张图」,不用放任何 gametype 判断。
 */
const ENTITIES: { id: string; file: string; url: string }[] = [
	{
		id: 'comfort',
		file: 'entities-comfort.png',
		url: `${DDNET_DATA}/assets/entities/comfort/ddnet.png`
	},
	{
		id: 'classic',
		file: 'entities-classic.png',
		url: `${DDNET_DATA}/editor/entities_clear/ddnet.png`
	}
];

/**
 * 只打包 demo 播放时真的会响的声音集(其余剔掉,省体积也省请求):
 * - DDNet 现在压根不播的:body_land / hook_loop / weapon_noammo / tee_cry / hit / menu
 * - 我们没做功能对应物:chat_server / chat_client / chat_highlight(聊天提示音)
 * - 服务端只会发 PAIN_LONG,PAIN_SHORT 留给 0.7 兼容
 * 数值/顺序仍然由 ddnet 的 content.py 决定,这里只挑名字。
 */
const USED_SOUNDS = new Set([
	'gun_fire',
	'shotgun_fire',
	'grenade_fire',
	'hammer_fire',
	'hammer_hit',
	'ninja_fire',
	'grenade_explode',
	'ninja_hit',
	'laser_fire',
	'laser_bounce',
	'weapon_switch',
	'player_pain_long',
	'player_jump',
	'player_die',
	'player_spawn',
	'weapon_spawn',
	// 客户端预测音(前端从 snapshot 推出来)
	'player_airjump',
	'player_skid',
	'hook_attach_ground',
	'hook_attach_player',
	'hook_noattach',
	'pickup_health',
	'pickup_armor',
	'pickup_grenade',
	'pickup_shotgun',
	'pickup_ninja',
	'ctf_drop',
	'ctf_return',
	'ctf_grab_pl',
	'ctf_grab_en',
	'ctf_capture'
]);

/**
 * Opus 编码参数:浏览器能用上的最新编码就是 Opus(Ogg 容器)。
 * VBR + 最高压缩 effort,40k 单声道对这类短音效够用;
 * 压到 32k 体积只省 30KB,但打击感会糊。
 */
/**
 * 打包好的声音包。**提交在仓库里**:
 * - ddnet 的音频数据好几年不动一次,每次部署都下载 131 个 .wv 再 ffmpeg 转一遍太浪费
 *   (CI 里光是装 ffmpeg 就要几十秒),而且哪天上游改了包名就整条部署挂掉
 * - 产物 213 KiB,直接进库最省事
 * 要重新生成:`bun run engine --sounds`
 */
const SOUNDS_ZIP = path.join(OUT, 'sounds', 'sounds.zip');

const OPUS_ARGS = [
	'-c:a',
	'libopus',
	'-b:a',
	'40k',
	'-vbr',
	'on',
	'-compression_level',
	'10',
	'-application',
	'audio',
	'-frame_duration',
	'20',
	'-ar',
	'48000',
	'-ac',
	'1',
	'-f',
	'ogg'
];

/** 外部 mapres(地图里没内嵌的图),按 06 / 07 分两份 */
const MAPRES = ['06', '07'];

const log = (msg: string) => console.log(`\x1b[36m[engine]\x1b[0m ${msg}`);

const sh = async (cmd: string[], opts: { cwd?: string; allowFail?: boolean } = {}) => {
	const proc = Bun.spawn(cmd, { cwd: opts.cwd ?? ROOT, stdout: 'pipe', stderr: 'pipe' });
	const code = await proc.exited;
	const out = await new Response(proc.stdout).text();
	const err = await new Response(proc.stderr).text();
	if (code !== 0 && !opts.allowFail) {
		throw new Error(`命令失败 (${code}): ${cmd.join(' ')}\n${out}\n${err}`);
	}
	return { code, out: out.trim(), err: err.trim() };
};

const hasCommand = (name: string) => Bun.which(name) !== null;

const download = async (url: string, dest: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`下载失败 ${url}: ${response.status} ${response.statusText}`);
	}
	mkdirSync(path.dirname(dest), { recursive: true });
	writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
};

const downloadCached = async (url: string, cached: string) => {
	if (existsSync(cached) && !force) return cached;
	await download(url, cached);
	return cached;
};

/**
 * 从 ddnet 的 datasrc/content.py 里读出声音表。
 * SOUND_* 枚举的 id 就是这里的顺序,所以 wasm 里的 SOUND_NAMES 必须和它一字不差,
 * 下面会拿 rust/twengine/src/sound.rs 里的表比对,不一致就直接失败。
 */
const readSoundTable = async () => {
	const source = await (await fetch(DDNET_CONTENT, { cache: 'force-cache' })).text();
	const sets: { name: string; files: string[] }[] = [];
	// 一行一个 SoundSet(python 没有分号),中间可能拼好几个 FileList、也可能直接列文件名;
	// 注意行尾的 `)))` 里第一个是 FileList 的,截取时只能吃掉最后两个
	const re = /^container\.sounds\.Add\(SoundSet\("([a-z0-9_]+)",\s*(.*)\)\)$/;
	for (const line of source.split('\n')) {
		const match = line.match(re);
		if (!match) continue;
		const [, name, list] = match;
		const files: string[] = [];
		for (const fileList of list.matchAll(/FileList\("([^"]+)",\s*(\d+)\)/g)) {
			const [, fmt, count] = fileList;
			for (let i = 1; i <= Number(count); i++) {
				files.push(fmt.replace('%02d', String(i).padStart(2, '0')));
			}
		}
		for (const single of list.matchAll(/"([^"%]+\.wv)"/g)) {
			if (!/^audio\//.test(single[1])) continue;
			files.push(single[1]);
		}
		if (files.length === 0) {
			throw new Error(`声音集 ${name} 没解析出文件:${list}`);
		}
		sets.push({ name, files });
	}
	return sets;
};

/** rust 侧的 SOUND_NAMES 是 id -> 名字的唯一来源,顺序错了声音就会串味 */
const checkSoundTable = (sets: { name: string }[]) => {
	const rust = readFileSync(path.join(CRATE, 'src/sound.rs'), 'utf-8');
	const block = rust.match(/pub const SOUND_NAMES: \[&str; \d+\] = \[([\s\S]*?)\];/);
	if (!block) throw new Error('src/sound.rs 里找不到 SOUND_NAMES');
	const names = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
	const expected = sets.map((s) => s.name);
	if (names.length !== expected.length || names.some((n, i) => n !== expected[i])) {
		const firstDiff = names.findIndex((n, i) => n !== expected[i]);
		throw new Error(
			`SOUND_NAMES 和 ddnet 的声音表不一致(第 ${firstDiff} 项:${names[firstDiff]} vs ${expected[firstDiff] || '缺'})。` +
				`\n  rust: ${names.join(', ')}\n  ddnet: ${expected.join(', ')}`
		);
	}
	log(`声音表与 ddnet 一致(${names.length} 个声音集)`);
};

/**
 * 声音文件是 .wv(wavpack),浏览器不认,全部转成 Opus(浏览器能用的最新编码)。
 *
 * 打包成一个 zip(STORE,不二次压缩)一次请求拿到,但里面**每个音效都是独立的 opus 流**:
 * 之前试过把所有音效拼成一条 opus,切片位置在编码器看来不是帧对齐的,
 * 上一段的尾巴会漏到下一段里(听感上就是“别的音效混进来”)。独立流解码就不会串。
 * 不压缩(zip method 0)是因为 opus 已经压过了,再 deflate 只是白花 CPU;
 * 前端解 zip 也只要切字节,几十行就够。
 */
const buildSounds = async (sets: { name: string; files: string[] }[] | null) => {
	// 仓库里已经有一份打包好的:直接用它。音频数据好几年不变,
	// 没必要每次构建都下载 131 个 .wv 再转一遍(CI 里连 ffmpeg 都不用装)。
	if (!rebuildSounds && existsSync(SOUNDS_ZIP)) {
		const size = statSync(SOUNDS_ZIP).size;
		log(`声音:用仓库里的 sounds.zip(${(size / 1024).toFixed(0)} KiB),重转加 --sounds`);
		return;
	}

	if (!sets) throw new Error('要重转声音,但没读到 ddnet 的声音表');
	if (!hasCommand('ffmpeg')) throw new Error('缺少 ffmpeg(声音要转 opus)');
	const outDir = path.join(OUT, 'sounds');
	const workDir = path.join(CACHE, 'opus');
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	mkdirSync(workDir, { recursive: true });

	const chosen = sets.filter((set) => USED_SOUNDS.has(set.name));
	const skipped = sets.filter((set) => !USED_SOUNDS.has(set.name)).map((set) => set.name);
	if (skipped.length > 0) log(`跳过不打包的声音:${skipped.join(', ')}`);

	const manifest: Record<string, string[]> = {};
	const entries: { name: string; data: Buffer }[] = [];
	let index = 0;
	let seconds = 0;

	for (const set of chosen) {
		const variants: string[] = [];
		for (const file of set.files) {
			const wv = await downloadCached(
				`${DDNET_DATA}/${file}`,
				path.join(CACHE, 'wv', path.basename(file))
			);
			const name = `${set.name}-${variants.length}.opus`;
			const target = path.join(workDir, name);
			const result = await sh(['ffmpeg', '-v', 'error', '-y', '-i', wv, ...OPUS_ARGS, target], {
				allowFail: true
			});
			if (result.code !== 0) throw new Error(`转码失败 ${file}: ${result.err}`);
			const data = readFileSync(target);
			entries.push({ name, data });
			variants.push(name);
			seconds += data.length / (40_000 / 8); // 只是给日志估个时长
			index++;
			if (index % 20 === 0) log(`已转码 ${index} 个声音`);
		}
		manifest[set.name] = variants;
	}

	// 清单也放 zip 里,前端只发一个请求
	entries.push({
		name: 'sounds.json',
		data: Buffer.from(JSON.stringify({ format: 'opus/ogg', sets: manifest }))
	});

	const zip = writeStoredZip(entries);
	writeFileSync(path.join(outDir, 'sounds.zip'), zip);
	log(
		`声音:${chosen.length} 个集合 / ${index} 个文件 → sounds.zip ${(zip.length / 1024).toFixed(0)} KiB`
	);
};

/** 最小的 zip 写入器:全部 STORE(不压缩),只为把一堆文件塞进一个响应 */
const writeStoredZip = (entries: { name: string; data: Buffer }[]) => {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf8');
		const crc = crc32(entry.data);
		const local = Buffer.alloc(30 + name.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0x0800, 6); // utf8 名字
		local.writeUInt16LE(0, 8); // method: store
		local.writeUInt16LE(0, 10); // time
		local.writeUInt16LE(0x21, 12); // date(固定值,保证可重复构建)
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(entry.data.length, 18);
		local.writeUInt32LE(entry.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28);
		name.copy(local, 30);
		locals.push(local, entry.data);

		const central = Buffer.alloc(46 + name.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0x21, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(entry.data.length, 20);
		central.writeUInt32LE(entry.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(0, 30); // extra
		central.writeUInt16LE(0, 32); // comment
		central.writeUInt16LE(0, 34); // disk
		central.writeUInt16LE(0, 36); // internal attrs
		central.writeUInt32LE(0, 38); // external attrs
		central.writeUInt32LE(offset, 42);
		name.copy(central, 46);
		centrals.push(central);

		offset += local.length + entry.data.length;
	}
	const directory = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, directory, end]);
};

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let value = i;
		for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		table[i] = value >>> 0;
	}
	return table;
})();

const crc32 = (data: Buffer) => {
	let crc = 0xffffffff;
	for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
};

const assetsFingerprint = (sounds: string) =>
	createHash('sha256')
		.update(
			JSON.stringify({
				textures: TEXTURES.map((t) => `${t.name}:${t.file}:${t.url}`),
				entities: ENTITIES.map((e) => `${e.id}:${e.file}:${e.url}`),
				mapres: MAPRES,
				patches: PATCHES.map((file) => (existsSync(file) ? readFileSync(file, 'utf-8') : '')),
				sounds
			})
		)
		.digest('hex')
		.slice(0, 16);

if (!existsSync(path.join(SUBMODULE, 'Cargo.toml'))) {
	log('找不到 submodule,先执行:git submodule update --init --recursive');
	process.exit(1);
}
if (!existsSync(path.join(CRATE, 'Cargo.toml'))) {
	log(`找不到引擎 crate:${CRATE}`);
	process.exit(1);
}

const commit = (await sh(['git', 'rev-parse', 'HEAD'], { cwd: SUBMODULE })).out;
// crate 自己也参与指纹:改了 rust 代码就得重编
const crateHash = createHash('sha256');
for (const file of [
	'Cargo.toml',
	'Cargo.lock',
	...['lib', 'camera', 'demo', 'gpu', 'map', 'nameplate', 'sound', 'sprites_helper', 'surface'].map(
		(m) => `src/${m}.rs`
	),
	// 名字牌的 WGSL 也是编译产物的一部分
	'src/nameplate.wgsl',
	'src/nameplate_sdf.wgsl'
]) {
	crateHash.update(file).update(readFileSync(path.join(CRATE, file)));
}
const crateFingerprint = crateHash.digest('hex').slice(0, 16);

// 只有要重转(或仓库里没有包)时才去读 ddnet 的声音表 —— 平时这一步连网络都不碰
const needsSounds = rebuildSounds || !existsSync(SOUNDS_ZIP);
const soundSets = needsSounds ? await readSoundTable() : null;
if (soundSets) checkSoundTable(soundSets);

// 声音指纹就是这个包本身的哈希:包没变,前端就不需要重新下载。
// 要算两次 —— `--sounds` 重转之后包会变,版本号得用最终那个文件算。
const hashSounds = () =>
	existsSync(SOUNDS_ZIP)
		? createHash('sha256').update(readFileSync(SOUNDS_ZIP)).digest('hex').slice(0, 16)
		: 'missing';

/** 贴图 + mapres + 补丁 + 读音效的总指纹:变了就得重下资源,version 也得跟着变 */
const assets = assetsFingerprint(hashSounds());

/**
 * 手写的三个前端文件(`demo.js` / `engine.js` / `sound.js`)。它们也带 `?v=<version>`,
 * 而且前面的 CDN 按 URL 缓存、不认 Cache-Control —— 只改 demo.js 时版本号如果不变,
 * 用户会一直跑到旧代码。所以这份指纹也必须进 version。
 */
const scriptsFingerprint = (() => {
	const hash = createHash('sha256');
	for (const file of ['demo.js', 'engine.js', 'sound.js']) {
		hash.update(file).update(readFileSync(path.join(OUT, file)));
	}
	return hash.digest('hex').slice(0, 16);
})();

/** 把所有会被缓存的东西(子模块 / crate / 资源 / 前端脚本 / wasm)混成版本号 */
const versionOf = (wasm: Uint8Array, assets: string, scripts: string) =>
	`${commit.slice(0, 8)}-${crateFingerprint.slice(0, 8)}-${assets.slice(0, 8)}-${createHash(
		'sha256'
	)
		.update(wasm)
		.update(scripts)
		.digest('hex')
		.slice(0, 8)}`;

const readStamp = () => {
	try {
		return JSON.parse(readFileSync(STAMP, 'utf-8')) as {
			version?: string;
			commit?: string;
			crate?: string;
			assets?: string;
			sounds?: string;
			scripts?: string;
			built?: string;
		};
	} catch {
		return null;
	}
};

const stamp = readStamp();
const upToDate =
	!force &&
	!rebuildSounds &&
	stamp?.commit === commit &&
	stamp?.crate === crateFingerprint &&
	stamp?.assets === assets &&
	existsSync(path.join(OUT, 'pkg/twengine.js')) &&
	existsSync(path.join(OUT, 'pkg/twengine_bg.wasm')) &&
	existsSync(path.join(OUT, 'assets/game.png')) &&
	existsSync(path.join(OUT, 'sounds/sounds.zip'));

if (upToDate) {
	if (stamp?.scripts !== scriptsFingerprint) {
		// wasm / 资源都没变,只是手写的前端脚本改了:不用重编,换版本号就够了
		const version = versionOf(
			readFileSync(path.join(OUT, 'pkg/twengine_bg.wasm')),
			assets,
			scriptsFingerprint
		);
		writeFileSync(
			STAMP,
			JSON.stringify(
				{ ...stamp, version, scripts: scriptsFingerprint, built: new Date().toISOString() },
				null,
				2
			)
		);
		log(`前端脚本变了,版本号已更新 → ${version}`);
	} else {
		log(`已有产物且源码未变(${commit.slice(0, 8)} / ${crateFingerprint}),跳过`);
	}
	process.exit(0);
}

if (!hasCommand('wasm-pack')) {
	log('缺少 wasm-pack,安装:cargo install wasm-pack');
	process.exit(1);
}
if (!hasCommand('unzip')) {
	log('缺少 unzip');
	process.exit(1);
}

// 1. 打补丁(先还原,保证可重复执行)
/** submodule 一定回到干净状态:补丁是构建期的临时改动,不该留在工作区里被人误提交 */
const revertPatches = async () => {
	const dirty = (await sh(['git', 'status', '--porcelain'], { cwd: SUBMODULE })).out;
	if (dirty) {
		await sh(['git', 'checkout', '--', '.'], { cwd: SUBMODULE });
	}
};
await revertPatches();
for (const patch of PATCHES) {
	if (!existsSync(patch)) throw new Error(`找不到补丁 ${patch}`);
	log(`应用补丁 ${path.basename(patch)}`);
	await sh(['git', 'apply', patch], { cwd: SUBMODULE });
}

// 2. 编译 wasm。不管成功还是失败(包括 Ctrl-C),都要把补丁撤销掉,
//    否则 vendor/twgpu 会带着未提交改动,下次手工 git apply 就会冲突。
const pkgTmp = path.join(CACHE, 'pkg');
rmSync(pkgTmp, { recursive: true, force: true });
log(`编译 twengine @ ${commit.slice(0, 8)}(release,首次编译要几分钟)`);
let build: { err: string };
try {
	build = await sh(
		['wasm-pack', 'build', CRATE, '--target', 'web', '--release', '--out-dir', pkgTmp],
		{
			cwd: SUBMODULE
		}
	);
} finally {
	await revertPatches();
}
if (build.err) console.log(build.err.split('\n').slice(-20).join('\n'));
if (!existsSync(path.join(pkgTmp, 'twengine_bg.wasm'))) {
	throw new Error('wasm-pack 没有产出 twengine_bg.wasm');
}

mkdirSync(path.join(OUT, 'pkg'), { recursive: true });
for (const file of ['twengine.js', 'twengine_bg.wasm']) {
	copyFileSync(path.join(pkgTmp, file), path.join(OUT, 'pkg', file));
}
const wasmBytes = readFileSync(path.join(OUT, 'pkg/twengine_bg.wasm'));
log(`wasm:${(wasmBytes.length / 1024 / 1024).toFixed(2)} MiB`);

// 3. 贴图 / 字体
mkdirSync(path.join(OUT, 'assets'), { recursive: true });
for (const texture of TEXTURES) {
	const cached = await downloadCached(texture.url, path.join(CACHE, 'assets', texture.file));
	copyFileSync(cached, path.join(OUT, 'assets', texture.file));
}
for (const entities of ENTITIES) {
	const cached = await downloadCached(entities.url, path.join(CACHE, 'assets', entities.file));
	copyFileSync(cached, path.join(OUT, 'assets', entities.file));
}

// 4. 外部 mapres
for (const version of MAPRES) {
	const zip = await downloadCached(
		`https://twdata.pati.ga/mapres/${version}/external.zip`,
		path.join(CACHE, `mapres_${version}.zip`)
	);
	const dir = path.join(OUT, 'assets', `mapres_${version}`);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	await sh(['unzip', '-qo', zip, '-d', dir]);
}

// 5. 声音
await buildSounds(soundSets);

// 声音包可能刚被重转过(哈希变了),下面的指纹/版本号都用**最终**的文件算
const soundFingerprint = hashSounds();
const assetsFinal = assetsFingerprint(soundFingerprint);

// 前端拿这个版本号给 pkg/assets/sounds 都加 ?v=,所以它必须**覆盖所有会被缓存的东西**:
//   commit      子模块(twgpu)的提交
//   crate       我们自己的 crate 源码指纹
//   assets      贴图 + mapres + 补丁 + 声音包的指纹
//   scripts     手写前端脚本的指纹(demo.js / engine.js / sound.js)
//   wasm        wasm 二进制的哈希(兜底:源码指纹漏了什么也不会漏它)
// 少算任何一项,对应文件的 URL 就不会变,浏览器那边就会一直吃旧缓存。
const version = versionOf(wasmBytes, assetsFinal, scriptsFingerprint);

// 产物好了就把 submodule 还原成上游原样
await sh(['git', 'checkout', '--', '.'], { cwd: SUBMODULE });

writeFileSync(
	STAMP,
	JSON.stringify(
		{
			version,
			commit,
			crate: crateFingerprint,
			assets: assetsFinal,
			sounds: soundFingerprint,
			scripts: scriptsFingerprint,
			built: new Date().toISOString()
		},
		null,
		2
	)
);
log('完成 → static/ddnet/engine/');
