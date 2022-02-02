/*
  服务器浏览器浏览页
  页面作者: TsFreddie
*/

import m from 'mithril';
import render from 'mithril-node-render';

import ServerCard from './server_card';
import appstate from '../../appstate';
import Clusterize from 'clusterize.js';
import { filter, orderBy, findIndex, matches } from 'lodash';
import * as bulmaToast from 'bulma-toast';

import 'styles/browser.scss';

interface Attr {
  include?: string;
  exclude?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
}
type CVnode = m.CVnode<Attr>;

export interface ServerState {
  ip: string;
  port: number;
  protocols: string[];
  max_clients: number;
  max_players: number;
  passworded: false;
  game_type: string;
  name: string;
  version: string;
  map: string;
  locale: string;
  num_clients: number;
  num_players: number;
  num_spectators: number;
  clients: [{ name: string }];
}

const filterOptions: {
  sortKeys: { key: string; order: 'asc' | 'desc' }[];
  include: string;
  exclude: string;
  country: string;
} = {
  sortKeys: [],
  include: '',
  exclude: '',
  country: '',
};

export default class implements m.ClassComponent<Attr> {
  clusterize: Clusterize;
  servers: ServerState[] = [];
  browserHeight = 100;

  timer: NodeJS.Timeout = null;

  updateServerList = async () => {
    this.timer = null;
    if (appstate.focused) {
      try {
        const list = await m.request<{ servers: ServerState[] }>({
          method: 'GET',
          url: 'https://api.teeworlds.cn/servers',
          params: { detail: true },
          //url: 'https://api.teeworlds.cn/servers/list',
        });
        this.servers = list.servers;
        this.filterServerList();
      } catch (e) {
        console.error(e);
        bulmaToast.toast({
          message: '未知错误，信息获取失败',
          type: 'is-danger',
          dismissible: true,
        });
      }
      this.timer = setTimeout(this.updateServerList, 10000);
    }
  };

  sortBy = (key: string) => {
    return () => {
      const keyIndex = findIndex(filterOptions.sortKeys, matches({ key }));

      if (keyIndex >= 0) {
        if (keyIndex === 1) {
          filterOptions.sortKeys = filterOptions.sortKeys.reverse();
        } else {
          const keyData = filterOptions.sortKeys[keyIndex];
          keyData.order = keyData.order == 'asc' ? 'desc' : 'asc';
        }
      } else if (filterOptions.sortKeys.length < 2) {
        filterOptions.sortKeys = [{ key, order: 'asc' }, ...filterOptions.sortKeys];
      } else {
        filterOptions.sortKeys = [{ key, order: 'asc' }, ...filterOptions.sortKeys.slice(0, 1)];
      }
      this.filterServerList();
    };
  };

  arrowOfKey = (key: string) => {
    const className = ['fas'];
    const keyIndex = findIndex(filterOptions.sortKeys, matches({ key }));
    if (keyIndex < 0)
      return (
        <span class="icon is-small">
          <i class="fas"></i>
        </span>
      );

    const data = filterOptions.sortKeys[keyIndex];
    if (data.order === 'asc') className.push('fa-arrow-down');
    else className.push('fa-arrow-up');

    if (keyIndex == 0) className.push('has-text-primary');
    return (
      <span class="icon is-small">
        <i class={className.join(' ')}></i>
      </span>
    );
  };

  filterServerList = () => {
    const keys = filterOptions.sortKeys.map(o => o.key);
    const order = filterOptions.sortKeys.map(o => o.order);
    const includeRegex = new RegExp(
      `^${filterOptions.include
        .split(' ')
        .filter(s => s)
        .map(s => `(?=.*${s})`)
        .join('')}.*$`,
      'i'
    );

    const excludeRegex = new RegExp(
      `${filterOptions.exclude
        .split(' ')
        .filter(s => s)
        .map(s => `(${s})`)
        .join('|')}`,
      'i'
    );

    const countryRegex = new RegExp(
      `^${filterOptions.country
        .split(' ')
        .filter(s => s)
        .map(s => `(?=.*${s})`)
        .join('')}.*$`,
      'i'
    );

    const countryData = orderBy(
      filter(this.servers, s => {
        const identifier = `${s.locale} `;
        return filterOptions.country && !identifier.match(countryRegex) ? false : true;
      }),
      keys,
      order
    );

    const data = orderBy(
      filter(countryData, s => {
        const identifier = `${s.name} ${s.ip} ${s.game_type} ${s.map} ${s.clients
          .map((obj, index) => {
            return obj.name != null ? obj.name : '';
          })
          .join(' ')}`;
        if (filterOptions.exclude && identifier.match(excludeRegex)) {
          return false;
        }
        if (filterOptions.include) {
          if (identifier.match(includeRegex)) {
            return true;
          } else {
            return false;
          }
        }
        return true;
      }),
      keys,
      order
    );
    this.clusterize.update(data.map(e => render.sync(<ServerCard server={e} />)));
  };

  updateBrowserHeight = () => {
    this.browserHeight =
      window.innerHeight - document.getElementById('browserTableHeader').offsetTop - 100;

    document.getElementById('browserTableContainer').style.height = `${this.browserHeight}px`;
  };

  constructor({ attrs }: CVnode) {
    document.title = '服务器浏览器 - Teeworlds中文社区';
    this.updateServerList();

    window.addEventListener('resize', this.updateBrowserHeight);
    if (attrs.include) filterOptions.include = attrs.include;
    if (attrs.exclude) filterOptions.exclude = attrs.exclude;
    if (attrs.sortBy)
      filterOptions.sortKeys = [
        { key: attrs.sortBy, order: attrs.order == 'asc' ? 'asc' : 'desc' },
      ];
  }

  onremove() {
    window.removeEventListener('resize', this.updateBrowserHeight);

    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    if (this.clusterize) this.clusterize.destroy(true);
    this.clusterize = null;
  }

  oncreate() {
    this.updateBrowserHeight();
    this.clusterize = new Clusterize({
      scrollId: 'browserTableContainer',
      contentId: 'browserTableBody',
      rows_in_block: 30,
      blocks_in_cluster: 2,
      tag: 'tr',
      no_data_text: '列表空空如也。。。',
    });

    document.getElementById('browserTableBody').onclick = function (e) {
      let ev = e || event;
      let target: any = ev.target || ev.srcElement;

      if (target.parentNode?.nodeName == 'TR') target = target.parentNode;
      if (target.nodeName != 'TR') return;

      const server = target.attributes.server.value;
      m.route.set('/browser/:server', { server });
    };
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
                    id="includeQuery"
                    class="input"
                    type="text"
                    placeholder="包含"
                    value={filterOptions.include}
                    oninput={(v: any) => {
                      filterOptions.include = v.target.value;
                      this.filterServerList();
                    }}
                  />
                  <span class="icon is-left">
                    <i class="fas fa-check"></i>
                  </span>
                </div>
              </div>
              <div class="field column mb-0">
                <div class="control has-icons-left has-icons-right">
                  <input
                    id="excludeQuery"
                    class="input"
                    type="text"
                    placeholder="排除"
                    value={filterOptions.exclude}
                    oninput={(v: any) => {
                      filterOptions.exclude = v.target.value;
                      this.filterServerList();
                    }}
                  />
                  <span class="icon is-left">
                    <i class="fas fa-times"></i>
                  </span>
                </div>
              </div>
              <div class="column is-narrow">
                <div class="control has-icons-left">
                  <div class="select">
                    <select
                      value={filterOptions.country}
                      onchange={(v: any) => {
                        filterOptions.country = v.target.value;
                        this.filterServerList();
                      }}
                    >
                      <option value="">全球</option>
                      <option value="as">(AS) 亚洲</option>
                      <option value="as:cn">(CN) 中国</option>
                      <option value="eu">(EU) 欧洲</option>
                      <option value="na">(NA) 北美洲</option>
                      <option value="oc">(OC) 大洋洲</option>
                      <option value="sa">(SA) 南美洲</option>
                      <option value="af">(AF) 非洲</option>
                    </select>
                  </div>
                  <div class="icon is-small is-left">
                    <i class="fas fa-globe"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="container.is-max-desktop">
          <div id="browserTableHeader" class="custom-scrollbar is-unselectable">
            <table class="table is-narrow is-fullwidth table-fixed">
              <thead>
                <tr>
                  <th>
                    <a style="display: block" onclick={this.sortBy('name')}>
                      名字 {this.arrowOfKey('name')}
                    </a>
                  </th>
                  <th class="is-hidden-mobile">
                    <a style="display: block" onclick={this.sortBy('game_type')}>
                      模式 {this.arrowOfKey('game_type')}
                    </a>
                  </th>
                  <th class="is-hidden-mobile">
                    <a style="display: block" onclick={this.sortBy('map')}>
                      地图 {this.arrowOfKey('map')}
                    </a>
                  </th>
                  <th class="has-text-right">
                    <a style="display: block" onclick={this.sortBy('num_clients')}>
                      玩家数 {this.arrowOfKey('num_clients')}
                    </a>
                  </th>
                  <th class="has-text-centered">
                    <a style="display: block" onclick={this.sortBy('locale')}>
                      地区 {this.arrowOfKey('locale')}
                    </a>
                  </th>
                </tr>
              </thead>
            </table>
          </div>
          <div
            id="browserTableContainer"
            class="custom-scrollbar is-unselectable"
            style={`height: ${this.browserHeight}px`}
          >
            <table class="table is-bordered is-narrow is-hoverable is-fullwidth table-fixed">
              <thead>
                <th class="p-0"></th>
                <th class="p-0 is-hidden-mobile"></th>
                <th class="p-0 is-hidden-mobile"></th>
                <th class="p-0"></th>
                <th class="p-0"></th>
              </thead>
              <tbody id="browserTableBody"></tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }
}
