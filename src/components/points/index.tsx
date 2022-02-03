/*
  查分页
  页面作者: TsFreddie
*/

import m from 'mithril';
import DDNetPlayerCard from './ddnet_player_card';
import KogPlayerCard from './kog_player_card';
import { find, findIndex } from 'lodash';
import { ENTER } from '../../utils';

import 'styles/points.scss';

interface Attr {
  player: string;
}
type CVnode = m.CVnode<Attr>;

export interface DDNetRank {
  points?: number;
  rank: number | 'unranked' | '无排名';
}

export interface DDNetPlayer {
  player: string;
  points: DDNetRank & { total: number };
  rank: DDNetRank;
  team_rank: DDNetRank;
  chn_points?: DDNetRank;
  chn_team_rank?: DDNetRank;
  chn_rank?: DDNetRank;
  points_last_month: DDNetRank;
  points_last_week: DDNetRank;
}

export interface KogPlayer {
  points: {
    Rank: number;
    Name: string;
    TPoints: number;
    PvPpoints: number;
    Points: number;
    Seasonpoints: number;
    RewardIndex: number;
    Powers: string;
  };
}

export interface SearchHandle {
  ddnet: DDNetPlayer | 'none';
  kog: KogPlayer | 'none';
  name: string;
}

const transformRank = (rank: DDNetRank) => {
  if (rank?.rank == 'unranked') {
    rank.rank = '无排名';
  }
};

export default class implements m.ClassComponent<Attr> {
  handles: SearchHandle[] = [];
  searchingPlayer: string;
  queryPlayer: string;
  searching: boolean = false;

  constructor(param: CVnode) {
    document.title = '分数查询 - Teeworlds中文社区';
    this.onupdate(param);
  }

  async searchDDNet(player: string, handle: SearchHandle) {
    try {
      const data = await m.request<DDNetPlayer>({
        method: 'GET',
        url: `https://api.teeworlds.cn/ddnet/players/${player}`,
      });

      try {
        const rank = await m.request<any>({
          method: 'GET',
          url: `https://api.teeworlds.cn/ddnet/players?server=chn`,
        });
        data.chn_points = find(rank.points, { name: data.player });
        data.chn_team_rank = find(rank.teamRank, { name: data.player });
        data.chn_rank = find(rank.rank, { name: data.player });
        if (data?.chn_points) transformRank(data?.chn_points);
        else data.chn_points = { rank: '无排名' };
        if (data?.chn_team_rank) transformRank(data?.chn_team_rank);
        else data.chn_team_rank = { rank: '无排名' };
        if (data?.chn_rank) transformRank(data?.chn_rank);
        else data.chn_rank = { rank: '无排名' };
      } catch (e) {
        console.log(e);
      }

      transformRank(data?.points);
      transformRank(data?.rank);
      transformRank(data?.team_rank);
      transformRank(data?.points_last_month);
      transformRank(data?.points_last_week);

      handle.ddnet = data;
    } catch (e) {
      console.error(e);
      handle.ddnet = 'none';
    }
  }

  async searchKOG(player: string, handle: SearchHandle) {
    try {
      const result = await m.request<KogPlayer>({
        method: 'GET',
        url: `https://api.teeworlds.cn/kog/players/${player}`,
      });
      handle.kog = result;
    } catch (e) {
      console.error(e);
      handle.kog = 'none';
    }
  }

  onremove() {}

  oncreate() {}

  onupdate({ attrs: { player } }: CVnode) {
    if (player != this.queryPlayer) {
      this.queryPlayer = player;
      if (player) {
        this.searchingPlayer = player;
        m.redraw();
        this.search();
      }
    }
  }

  search() {
    if (!this.searchingPlayer) return;
    this.searching = true;
    const player = this.searchingPlayer;

    const existing = findIndex(this.handles, { name: player });
    if (existing >= 0) {
      const handle = this.handles[existing];
      this.handles.splice(existing, 1);
      this.handles.unshift(handle);
      this.searching = false;
      return;
    }

    const newHandle: SearchHandle = {
      ddnet: null,
      kog: null,
      name: player,
    };

    this.handles.unshift(newHandle);
    this.handles.splice(5);
    Promise.all([this.searchDDNet(player, newHandle), this.searchKOG(player, newHandle)]).then(
      () => {
        this.searching = false;
      }
    );
  }

  view() {
    return (
      <section id="browser" class="container">
        <div class="card my-4">
          <div class="card-content py-5 px-5">
            <div class="columns">
              <div class="field column mb-0">
                <div class="control has-icons-left has-icons-right">
                  <input
                    id="searchQuery"
                    class="input"
                    type="text"
                    placeholder="玩家名称"
                    value={this.searchingPlayer}
                    oninput={(v: any) => {
                      this.searchingPlayer = v.target.value;
                    }}
                    onkeydown={ENTER(() => this.search())}
                    disabled={this.searching}
                  />
                  <span class="icon is-left">
                    <i class="fas fa-user"></i>
                  </span>
                </div>
              </div>
              <div class="column is-narrow">
                <div class="control has-icons-left">
                  <button
                    class="button"
                    onclick={() => {
                      this.search();
                    }}
                    disabled={this.searching}
                  >
                    <i class="fas fa-search mr-2"></i>
                    查询
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div>
          {this.handles.map((item, index) => (
            <>
              {(index == 0 || (item.ddnet != null && item.ddnet != 'none')) && (
                <DDNetPlayerCard player={item.ddnet} name={item.name} />
              )}
              {(index == 0 || (item.ddnet != null && item.ddnet != 'none')) && (
                <KogPlayerCard player={item.kog} name={item.name} />
              )}
            </>
          ))}
        </div>
        <div class="container is-max-desktop"></div>
      </section>
    );
  }
}
