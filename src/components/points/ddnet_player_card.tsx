import m from 'mithril';
import { DDNetPlayer } from '.';

interface Attr {
  player: DDNetPlayer | 'none';
  name: string;
}
type CVnode = m.CVnode<Attr>;

const ddnetEncode = (str: string) =>
  encodeURIComponent(
    str
      .replace(/\-/g, '-45-')
      .replace(/\\/g, '-92-')
      .replace(/\%/g, '-37-')
      .replace(/\?/g, '-63-')
      .replace(/\&/g, '-38-')
      .replace(/\=/g, '-61-')
      .replace(/\//g, '-47-')
  );

export default class implements m.ClassComponent<Attr> {
  view({ attrs: { player, name } }: CVnode) {
    if (player == null) {
      return (
        <div class="card my-4">
          <header class="card-header">
            <p class="card-header-title">DDNet玩家：{name}</p>
          </header>
          <div class="card-content">查询中。。。</div>
        </div>
      );
    }
    if (player == 'none') {
      return (
        <div class="card my-4">
          <header class="card-header">
            <p class="card-header-title">DDNet玩家：{name}</p>
          </header>
          <div class="card-content">未找到玩家记录</div>
        </div>
      );
    }
    return (
      <div class="card my-4">
        <header class="card-header">
          <p class="card-header-title">
            <a href={`https://ddnet.tw/players/${ddnetEncode(name)}`}>DDNet玩家：{name}</a>
          </p>
        </header>
        <div class="card-content">
          <div class="content">
            <div class="columns is-multiline">
              <div class="column is-half columns is-mobile my-0 py-0">
                <div class="column">
                  <div class="box p-3 twcn-is-global">
                    <div class="subtitle mb-2">
                      <span class="icon is-small">
                        <i class="fas fa-globe"></i>
                      </span>
                      <span class="ml-4">全球点数</span>
                    </div>
                    <div class="level is-mobile">
                      <div class="level-item has-text-centered">
                        <div>
                          <p class="heading">点数</p>
                          <p class="title">{player.points.points}</p>
                        </div>
                      </div>
                      <div class="level-item has-text-centered">
                        <div>
                          <p class="heading">排名</p>
                          <p class="title">{player.points.rank}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {player.chn_points && (
                  <div class="column">
                    <div class="box p-3 twcn-is-chn">
                      <div class="subtitle mb-2">
                        <span class="icon is-small">
                          <i class="chn-icon"></i>
                        </span>
                        <span class="ml-4">国服点数</span>
                      </div>
                      <div class="level is-mobile">
                        {player.chn_points.points && (
                          <div class="level-item has-text-centered">
                            <div>
                              <p class="heading">点数</p>
                              <p class="title">{player.chn_points.points}</p>
                            </div>
                          </div>
                        )}
                        <div class="level-item has-text-centered">
                          <div>
                            <p class="heading">排名</p>
                            <p class="title">{player.chn_points.rank}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div class="column is-half columns is-mobile my-0 py-0">
                <div class="column">
                  <div class="box p-3 twcn-is-global">
                    <div class="subtitle mb-2">
                      <span class="icon is-small">
                        <i class="fas fa-globe"></i>
                      </span>
                      <span class="ml-4">排名点数</span>
                    </div>
                    <div class="level is-mobile">
                      {player.rank.points && (
                        <div class="level-item has-text-centered">
                          <div>
                            <p class="heading">点数</p>
                            <p class="title">{player.rank.points}</p>
                          </div>
                        </div>
                      )}
                      <div class="level-item has-text-centered">
                        <div>
                          <p class="heading">排名</p>
                          <p class="title">{player.rank.rank}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {player.chn_rank && (
                  <div class="column">
                    <div class="box p-3 twcn-is-chn">
                      <div class="subtitle mb-2">
                        <span class="icon is-small">
                          <i class="chn-icon"></i>
                        </span>
                        <span class="ml-4">排名点数</span>
                      </div>
                      <div class="level is-mobile">
                        {player.chn_rank.points && (
                          <div class="level-item has-text-centered">
                            <div>
                              <p class="heading">点数</p>
                              <p class="title">{player.chn_rank.points}</p>
                            </div>
                          </div>
                        )}
                        <div class="level-item has-text-centered">
                          <div>
                            <p class="heading">排名</p>
                            <p class="title">{player.chn_rank.rank}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div class="column is-half columns is-mobile my-0 py-0">
                <div class="column">
                  <div class="box p-3 twcn-is-global">
                    <div class="subtitle mb-2">
                      <span class="icon is-small">
                        <i class="fas fa-globe"></i>
                      </span>
                      <span class="ml-4">组队排名</span>
                    </div>
                    <div class="level is-mobile">
                      {player.team_rank.points && (
                        <div class="level-item has-text-centered">
                          <div>
                            <p class="heading">点数</p>
                            <p class="title">{player.team_rank.points}</p>
                          </div>
                        </div>
                      )}
                      <div class="level-item has-text-centered">
                        <div>
                          <p class="heading">排名</p>
                          <p class="title">{player.team_rank.rank}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {player.chn_team_rank && (
                  <div class="column">
                    <div class="box p-3 twcn-is-chn">
                      <div class="subtitle mb-2">
                        <span class="icon is-small">
                          <i class="chn-icon"></i>
                        </span>
                        <span class="ml-4">组队排名</span>
                      </div>
                      <div class="level is-mobile">
                        {player.chn_team_rank.points && (
                          <div class="level-item has-text-centered">
                            <div>
                              <p class="heading">点数</p>
                              <p class="title">{player.chn_team_rank.points}</p>
                            </div>
                          </div>
                        )}
                        <div class="level-item has-text-centered">
                          <div>
                            <p class="heading">排名</p>
                            <p class="title">{player.chn_team_rank.rank}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div class="column is-half columns is-mobile my-0 py-0">
                <div class="column">
                  <div class="box p-3">
                    <div class="subtitle mb-2">
                      <span class="icon is-small">
                        <i class="fas fa-calendar"></i>
                      </span>
                      <span class="ml-4">周增长</span>
                    </div>
                    <div class="level is-mobile">
                      {player.points_last_week.points && (
                        <div class="level-item has-text-centered">
                          <div>
                            <p class="heading">点数</p>
                            <p class="title">{player.points_last_week.points}</p>
                          </div>
                        </div>
                      )}
                      <div class="level-item has-text-centered">
                        <div>
                          <p class="heading">排名</p>
                          <p class="title">{player.points_last_week.rank}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="column">
                  <div class="box p-3">
                    <div class="subtitle mb-2">
                      <span class="icon is-small">
                        <i class="fas fa-calendar"></i>
                      </span>
                      <span class="ml-4">月增长</span>
                    </div>
                    <div class="level is-mobile">
                      {player.points_last_month.points && (
                        <div class="level-item has-text-centered">
                          <div>
                            <p class="heading">点数</p>
                            <p class="title">{player.points_last_month.points}</p>
                          </div>
                        </div>
                      )}
                      <div class="level-item has-text-centered">
                        <div>
                          <p class="heading">排名</p>
                          <p class="title">{player.points_last_month.rank}</p>
                        </div>
                      </div>
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
