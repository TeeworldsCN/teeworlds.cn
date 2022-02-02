import m from 'mithril';
import { KogPlayer } from '.';

interface Attr {
  player: KogPlayer | 'none';
  name: string;
}
type CVnode = m.CVnode<Attr>;

export default class implements m.ClassComponent<Attr> {
  view({ attrs: { player, name } }: CVnode) {
    if (player == null) {
      return (
        <div class="card my-4">
          <header class="card-header">
            <p class="card-header-title">KOG玩家：{name}</p>
          </header>
          <div class="card-content">查询中。。。</div>
        </div>
      );
    }
    if (player == 'none') {
      return (
        <div class="card my-4">
          <header class="card-header">
            <p class="card-header-title">KOG玩家：{name}</p>
          </header>
          <div class="card-content">未找到玩家记录</div>
        </div>
      );
    }
    return (
      <div class="card my-4">
        <header class="card-header">
          <p class="card-header-title">
            <a href={`https://kog.tw/#p=players&player=${name}`}>KOG玩家：{name}</a>
          </p>
        </header>
        <div class="card-content">
          <div class="content">
            <div class="box">
              <div class="subtitle">
                <span class="icon is-small">
                  <i class="fas fa-globe"></i>
                </span>
                <span class="ml-4">点数信息</span>
              </div>
              <div class="columns">
                <div class="column is-half level is-mobile">
                  <div class="level-item has-text-centered">
                    <div>
                      <p class="heading">排名</p>
                      <p class="title">{player.points.Rank}</p>
                    </div>
                  </div>
                  <div class="level-item has-text-centered">
                    <div>
                      <p class="heading">排位分</p>
                      <p class="title">{player.points.TPoints}</p>
                    </div>
                  </div>
                </div>
                <div class="column is-half level is-mobile">
                  <div class="level-item has-text-centered">
                    <div>
                      <p class="heading">固定分</p>
                      <p class="title">{player.points.Points}</p>
                    </div>
                  </div>
                  <div class="level-item has-text-centered">
                    <div>
                      <p class="heading">对战分</p>
                      <p class="title">{player.points.PvPpoints}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
