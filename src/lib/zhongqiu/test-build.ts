/**
 * 这是不是一个「测试 build」?
 *
 * 由构建期的静态环境变量决定:`/.env.test` 里写 `PUBLIC_ZQ_TEST=1`,构建时带
 * `--mode test`(见 vite.config.ts 里的 `__ZQ_TEST_BUILD__` 定义)。
 *
 * 只有测试 build 才开两个开发功能:
 *   · `__cheat`(页面里的作弊引擎)
 *   · `/zhongqiu/data`(卡池一览表)
 *
 * 上线的版本里这两个功能是关掉的 —— 而且 `__ZQ_TEST_BUILD__` 是编译期常量,
 * 生产构建里 `import.meta.env.DEV || ZQ_TEST_BUILD` 会折叠成 `false`,
 * 相关分支连代码一起被 DCE,不只是「运行时藏起来」。
 */
declare const __ZQ_TEST_BUILD__: boolean;

export const ZQ_TEST_BUILD = __ZQ_TEST_BUILD__;
