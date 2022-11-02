/*
  服务器浏览器详情页
  页面作者: TsFreddie
*/

import m from 'mithril';
import { toSafeInteger, orderBy, padStart, filter } from 'lodash';
import * as clipboard from 'clipboard-polyfill/text';
import * as bulmaToast from 'bulma-toast';
import appstate from '../../appstate';
import { ServerStateProcessed } from '.';

interface Attr {
  server: ServerStateProcessed;
  expanded: boolean;
}
type CVnode = m.CVnode<Attr>;

const scoreToTime = (score: number) => {
  if (score == -9999) return '-';
  score = -score;
  const minutes = Math.floor(score / 60);
  const seconds = Math.floor(score % 60);
  return `${padStart(minutes.toString(), 2, '0')}:${padStart(seconds.toString(), 2, '0')}`;
};

export default class implements m.ClassComponent<Attr> {
  private dom: HTMLElement;
  private running: boolean;
  private listener: (ev: MouseEvent) => void;

  oncreate(vnode: m.VnodeDOM<Attr>) {
    this.running = true;
    this.dom = vnode.dom as HTMLElement;
    this.listener = (ev: MouseEvent) => this.update(ev);
    document.addEventListener('mousemove', this.listener, false);
  }

  onremove() {
    document.removeEventListener('mousemove', this.listener, false);
  }

  update(ev: MouseEvent) {
    if (!this.running) return;
    this.dom.style.top = `${ev.clientY + 20}px`;
    this.dom.style.left = `${ev.clientX + 20}px`;
  }

  view({ attrs: { server, expanded } }: CVnode) {
    // contain race/gores or at least half of the players are negative scored
    const isRace =
      server &&
      (server.info.game_type.match(/(race)|(gores)/i) ||
        server.info.clients.filter(c => c.score <= -30).length / server.info.clients.length > 0.5);
    return (
      <div class={'card detail-float'}>
        <div class="columns">
          <div class="column">
            <div class="card">
              <header class="card-header">
                <p class="card-header-title">服务器详情</p>
              </header>
              <div class="card-content">
                {server ? (
                  <div class="content">
                    <p>服务器地址: {server.addresses.join(' ')}</p>
                    <p>名字: {server.info.name}</p>
                    <p>模式: {server.info.game_type}</p>
                    <p>地图: {server.info.map.name}</p>
                    <p>密码: {server.info.passworded ? '有' : '无'}</p>
                    <p>服务端版本: {server.info.version}</p>
                    {/* <p>
                      协议:{' '}
                      {server.info.protocols
                        .map(s => s.replace('tw-', '').replace('+udp', ''))
                        .join(' | ')}
                    </p> */}
                    {/* <div class="field is-grouped">
                      <p class="control">
                        <a
                          class="button is-success"
                          href={`steam://run/412220//${this.server.ip}:${this.server.port}/`}
                        >
                          <span class="icon is-small">
                            <i class="fab fa-steam"></i>
                          </span>
                          <span>Steam一键加入</span>
                        </a>
                      </p>
                      <p class="control">
                        <button
                          class="button is-info"
                          href="#"
                          onclick={() =>
                            clipboard.writeText(`${this.server.ip}:${this.server.port}`).then(
                              () => {
                                bulmaToast.toast({
                                  message: '地址已复制',
                                  type: 'is-success',
                                  dismissible: true,
                                });
                              },
                              () => {
                                bulmaToast.toast({
                                  message: '地址复制失败',
                                  type: 'is-danger',
                                  dismissible: true,
                                });
                              }
                            )
                          }
                        >
                          <span class="icon is-small">
                            <i class="fas fa-clipboard"></i>
                          </span>
                          <span>复制地址</span>
                        </button>
                      </p>
                    </div> */}
                  </div>
                ) : (
                  <div class="content">
                    <p>服务器不存在或离线</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div class="column">
            <div class="card">
              <header class="card-header">
                <p class="card-header-title">
                  玩家列表 {server && `${server.info.num_players}/${server.info.max_clients}`}
                </p>
              </header>
              <table class="table is-narrow is-fullwidth is-bordered is-striped table-fixed">
                <thead>
                  <tr>
                    <th class="has-text-right">分数</th>
                    <th style="width:50%">名字</th>
                    <th style="width:25%">战队</th>
                  </tr>
                </thead>
                <tbody>
                  {server ? (
                    server.info.clients.length > 0 ? (
                      orderBy(
                        server.info.clients,
                        ['is_player', 'score', 'name'],
                        ['desc', 'desc', 'asc']
                      ).map(c => (
                        <tr>
                          <td class="no-wordwrap has-text-right">
                            {c.is_player ? (isRace ? scoreToTime(c.score) : c.score) : '旁观'}
                          </td>
                          <td class="no-wordwrap">{c.name}</td>
                          <td class="no-wordwrap">{c.clan}</td>
                        </tr>
                      ))
                    ) : (
                      <tr class="has-text-centered">没有玩家</tr>
                    )
                  ) : (
                    <tr class="has-text-centered"></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
