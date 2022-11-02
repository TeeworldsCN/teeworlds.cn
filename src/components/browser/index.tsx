/*
  服务器浏览器浏览页
  页面作者: TsFreddie
*/

import m from 'mithril';
import render from 'mithril-node-render';

import ServerCard from './server_card';
import appstate from '../../appstate';
import Clusterize from 'clusterize.js';
import _, { filter, orderBy, findIndex, matches } from 'lodash';

import 'styles/browser.scss';
import { BrowserServer, ServerState } from '../../servers/browser_server';
import ServerDetail from './server_detail';

interface Attr {
  include?: string;
  exclude?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
}
type CVnode = m.CVnode<Attr>;

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

export type ServerStateProcessed = ServerState & {
  info: {
    num_players: number;
  };
  index: number;
};

export default class implements m.ClassComponent<Attr> {
  clusterize: Clusterize;
  servers: ServerStateProcessed[] = [];
  browserHeight = 100;

  selected: ServerStateProcessed = null;
  expanded: boolean = false;

  timer: NodeJS.Timeout = null;

  updateServerList = async () => {
    this.timer = null;
    if (appstate.focused) {
      this.servers = (await BrowserServer.fetch()).map((s, i) => {
        (s as ServerStateProcessed).info.num_players = s.info.clients.length;
        (s as ServerStateProcessed).index = i;
        return s as ServerStateProcessed;
      });
      this.timer = setTimeout(this.updateServerList, 2000);
      this.filterServerList();
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
        const identifier = `${s.location} `;
        return filterOptions.country && !identifier.match(countryRegex) ? false : true;
      }),
      keys,
      order
    );

    const data = orderBy(
      filter(countryData, s => {
        const identifier = `${s.info.name} ${s.addresses.join(' ')} ${s.info.game_type} ${
          s.info.map
        } ${s.info.clients
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

    const tableContent = document.getElementById('browserTableBody');
    const browserTableContainer = document.getElementById('browserTableContainer');

    const mouseEvent = (e: MouseEvent) => {
      let ev = e || event;
      let target: any = ev.target || ev.srcElement;

      if (target.parentNode?.nodeName == 'TR') target = target.parentNode;
      if (target.nodeName != 'TR') {
        this.selected = null;
        m.redraw();
        return;
      }

      const value = target.attributes?.server?.value;
      if (isNaN(value) || value == null) {
        this.selected = null;
        m.redraw();
        return;
      }

      const server = parseInt(value);
      this.selected = this.servers[server];
      m.redraw();
    };

    tableContent.onmouseover = mouseEvent;
    tableContent.onmouseout = mouseEvent;
    browserTableContainer.onmouseout = () => {
      this.selected = null;
      m.redraw();
    };

    tableContent.onclick = e => {
      let ev = e || event;
      let target: any = ev.target || ev.srcElement;

      if (target.parentNode?.nodeName == 'TR') target = target.parentNode;
      if (target.nodeName != 'TR') return;

      this.expanded = true;
      m.redraw();
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
                    <a style="display: block" onclick={this.sortBy('info.name')}>
                      名字 {this.arrowOfKey('info.name')}
                    </a>
                  </th>
                  <th class="is-hidden-mobile">
                    <a style="display: block" onclick={this.sortBy('info.game_type')}>
                      模式 {this.arrowOfKey('info.game_type')}
                    </a>
                  </th>
                  <th class="is-hidden-mobile">
                    <a style="display: block" onclick={this.sortBy('info.map.name')}>
                      地图 {this.arrowOfKey('info.map')}
                    </a>
                  </th>
                  <th class="has-text-right">
                    <a style="display: block" onclick={this.sortBy('info.num_players')}>
                      玩家数 {this.arrowOfKey('info.num_players')}
                    </a>
                  </th>
                  <th class="has-text-centered">
                    <a style="display: block" onclick={this.sortBy('location')}>
                      地区 {this.arrowOfKey('location')}
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
        {this.selected && (
          <ServerDetail server={this.selected} expanded={this.expanded}></ServerDetail>
        )}
      </section>
    );
  }
}
