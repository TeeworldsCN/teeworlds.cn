/**
 * 构建 patiga 的 mappreview(twgpu-web),产物放进 static/ddnet/mappreview/。
 *
 * 源码以 git submodule 的形式引在 vendor/twgpu(gitlab.com/ddnet-rs/twgpu),
 * 这里只负责编译 wasm + 抓取渲染需要的贴图/mapres,产物不入版本库。
 *
 * 依赖:rust(wasm32-unknown-unknown target)、wasm-pack、unzip
 *
 * 用法:
 *   bun scripts/build-mappreview.ts           # 已有产物且上游没动过就跳过
 *   bun scripts/build-mappreview.ts --force   # 强制重编
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');
const SUBMODULE = path.join(ROOT, 'vendor/twgpu');
const CRATE = path.join(SUBMODULE, 'twgpu-web');
const OUT = path.join(ROOT, 'static/ddnet/mappreview');
const CACHE = path.join(ROOT, 'cache/mappreview');
// 静态文件里不能带点开头(sirv 默认不 serve dotfiles),而且前端要读它做缓存版本号
const STAMP = path.join(OUT, 'version.json');
// 对 submodule 的补丁,编译前按顺序应用(见 patches/)
const PATCHES = [path.join(ROOT, 'patches/twgpu-mipmaps.patch')];

const force = process.argv.includes('--force');

const DDNET_DATA = 'https://raw.githubusercontent.com/ddnet/ddnet/master/data';

/** 渲染器需要的贴图,和 wasm 里 add_texture 认的名字一一对应 */
const TEXTURES: { name: string; file: string; url: string }[] = [
	{ name: 'game', file: 'game.png', url: `${DDNET_DATA}/game.png` },
	{ name: 'particles', file: 'particles.png', url: `${DDNET_DATA}/particles.png` },
	{ name: 'emoticons', file: 'emoticons.png', url: `${DDNET_DATA}/emoticons.png` },
	{ name: 'extras', file: 'extras.png', url: `${DDNET_DATA}/extras.png` },
	{
		name: 'entities',
		file: 'entities.png',
		url: `${DDNET_DATA}/assets/entities/comfort/ddnet.png`
	},
	{ name: 'default', file: 'default.png', url: `${DDNET_DATA}/skins/default.png` },
	{ name: 'x_ninja', file: 'x_ninja.png', url: `${DDNET_DATA}/skins/x_ninja.png` },
	{ name: 'DejaVuSans.ttf', file: 'DejaVuSans.ttf', url: `${DDNET_DATA}/fonts/DejaVuSans.ttf` }
];

/** 外部 mapres(地图里没内嵌的图),按 06 / 07 分两份 */
const MAPRES = ['06', '07'];

const log = (msg: string) => console.log(`\x1b[36m[mappreview]\x1b[0m ${msg}`);

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
	log(`下载 ${url}`);
	await download(url, cached);
	return cached;
};

// 产物和上游 commit、贴图列表绑在一起,任一边变了就得重编
const assetsFingerprint = JSON.stringify({
	textures: TEXTURES.map((t) => `${t.name}:${t.file}:${t.url}`),
	mapres: MAPRES,
	// 补丁内容也参与指纹:改了补丁就得重编
	patches: PATCHES.map((file) => (existsSync(file) ? readFileSync(file, 'utf-8') : ''))
});

const readStamp = () => {
	try {
		return JSON.parse(readFileSync(STAMP, 'utf-8')) as { commit?: string; assets?: string };
	} catch {
		return null;
	}
};

if (!existsSync(path.join(SUBMODULE, 'Cargo.toml'))) {
	log(`找不到 submodule,先执行:git submodule update --init --recursive`);
	process.exit(1);
}

const commit = (await sh(['git', 'rev-parse', 'HEAD'], { cwd: SUBMODULE })).out;
const stamp = readStamp();
const upToDate =
	!force &&
	stamp?.commit === commit &&
	stamp?.assets === assetsFingerprint &&
	existsSync(path.join(OUT, 'pkg/twgpu_web.js')) &&
	existsSync(path.join(OUT, 'pkg/twgpu_web_bg.wasm')) &&
	existsSync(path.join(OUT, 'assets/game.png'));

if (upToDate) {
	log(`已有产物且上游未变 (${commit.slice(0, 8)}),跳过编译`);
	process.exit(0);
}

if (!hasCommand('wasm-pack')) {
	log('缺少 wasm-pack,安装:');
	log(
		'  cargo install wasm-pack   (或从 https://github.com/rustwasm/wasm-pack/releases 下预编译包)'
	);
	process.exit(1);
}
if (!hasCommand('unzip')) {
	log('缺少 unzip');
	process.exit(1);
}

// 1. 应用补丁(先还原,保证可重复执行)
await sh(['git', 'checkout', '--', '.'], { cwd: SUBMODULE });
for (const patch of PATCHES) {
	if (!existsSync(patch)) {
		throw new Error(`找不到补丁 ${patch}`);
	}
	log(`应用补丁 ${path.basename(patch)}`);
	await sh(['git', 'apply', patch], { cwd: SUBMODULE });
}

// 2. 编译 wasm
const pkgTmp = path.join(CACHE, 'pkg');
rmSync(pkgTmp, { recursive: true, force: true });
log(`编译 twgpu-web @ ${commit.slice(0, 8)}(release,首次编译需要几分钟)`);
const build = await sh(
	['wasm-pack', 'build', CRATE, '--target', 'web', '--release', '--out-dir', pkgTmp],
	{ cwd: SUBMODULE }
);
if (build.err) console.log(build.err.split('\n').slice(-20).join('\n'));
if (!existsSync(path.join(pkgTmp, 'twgpu_web_bg.wasm'))) {
	throw new Error('wasm-pack 没有产出 twgpu_web_bg.wasm');
}

mkdirSync(path.join(OUT, 'pkg'), { recursive: true });
for (const file of ['twgpu_web.js', 'twgpu_web_bg.wasm']) {
	copyFileSync(path.join(pkgTmp, file), path.join(OUT, 'pkg', file));
}
const wasmBytes = readFileSync(path.join(OUT, 'pkg/twgpu_web_bg.wasm'));
log(`wasm:${(wasmBytes.length / 1024 / 1024).toFixed(2)} MiB`);
// 前端拿这个版本号给 pkg/assets 加 ?v=,内容变了就得换 key,不然老访客会用到缓存里的旧 wasm
const version = `${commit.slice(0, 8)}-${createHash('sha256').update(wasmBytes).digest('hex').slice(0, 8)}`;

// 3. 贴图 / 字体
mkdirSync(path.join(OUT, 'assets'), { recursive: true });
for (const texture of TEXTURES) {
	const cached = await downloadCached(texture.url, path.join(CACHE, 'assets', texture.file));
	copyFileSync(cached, path.join(OUT, 'assets', texture.file));
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

// 产物好了就把 submodule 还原成上游原样,git status 保持干净
await sh(['git', 'checkout', '--', '.'], { cwd: SUBMODULE });

writeFileSync(
	STAMP,
	JSON.stringify(
		{ version, commit, assets: assetsFingerprint, built: new Date().toISOString() },
		null,
		2
	)
);
log('完成 → static/ddnet/mappreview/');
