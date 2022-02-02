import m from 'mithril';

import 'styles/home.scss';

export default class implements m.ClassComponent {
  data = '';

  constructor() {
    document.title = 'Teeworlds中文社区';
  }

  view() {
    return (
      <div class="container">
        <div class="content">
          <section class="section is-medium">
            <div class="linkButton">
              {m(
                m.route.Link,
                { href: '/browser', class: 'button' },
                <h1 class="title">服务器浏览器</h1>
              )}
              <h2 class="subtitle">搜索 Teeworlds 在线服务器！</h2>
            </div>
            <div class="linkButton">
              {m(
                m.route.Link,
                { href: '/points', class: 'button' },
                <h1 class="title">DDNet/KOG分数查询</h1>
              )}
              <h2 class="subtitle">查询玩家名在DDNet或KOG获得的分数</h2>
            </div>
            <div class="linkButton">
              <a class="button" href="https://wiki.teeworlds.cn/">
                <h1 class="title">中文维基百科</h1>
              </a>
              <h2 class="subtitle">原生模式/mod介绍，服务器开设指南，闯关指南...</h2>
            </div>
          </section>
          <section class="section is-small">
            <div class="link">
              <h1 class="title">中文社区</h1>
              <a class="button" href="https://www.kaiheila.cn/app/invite/pNXyP8">
                开黑啦
              </a>
              <a class="button" href="https://discord.gg/dqwuHEq">
                Discord
              </a>
              <a class="button" href="https://t.me/teeworldscn">
                Telegram
              </a>
            </div>
          </section>
        </div>
      </div>
    );
  }
}
