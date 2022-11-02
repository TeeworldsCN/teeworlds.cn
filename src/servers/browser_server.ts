import m from 'mithril';
import appstate from 'src/appstate';
import * as bulmaToast from 'bulma-toast';

export interface ClientState {
  name: string;
  clan: string;
  country: number;
  score: number;
  is_player: boolean;
}

export interface ServerState {
  addresses: string[];
  location: string;
  info: {
    max_clients: number;
    max_players: number;
    passworded: boolean;
    game_type: string;
    name: string;
    map: {
      name: string;
    };
    version: string;
    clients: ClientState[];
  };
}

class BrowserServerSingleton {
  private servers: ServerState[] = [];
  private lastUpdate: number = 0;

  public async fetch() {
    if (Date.now() - this.lastUpdate < 5000) {
      return this.servers;
    }

    try {
      const list = await m.request<{ servers: ServerState[] }>({
        method: 'GET',
        url: 'https://master2.ddnet.org/ddnet/15/servers.json',
        params: { detail: true },
      });
      this.servers = list.servers;
      return this.servers;
    } catch (e) {
      console.error(e);
      bulmaToast.toast({
        message: '未知错误，信息获取失败',
        type: 'is-danger',
        dismissible: true,
      });

      return this.servers;
    }
  }
}

export const BrowserServer = new BrowserServerSingleton();
