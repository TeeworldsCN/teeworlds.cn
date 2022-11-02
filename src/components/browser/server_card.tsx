import m from 'mithril';
import { padStart } from 'lodash';
import { ServerStateProcessed } from '.';

interface Attr {
  server: ServerStateProcessed;
}
type CVnode = m.CVnode<Attr>;

export default class implements m.ClassComponent<Attr> {
  view({ attrs: { server } }: CVnode) {
    return (
      <tr server={`${server.index}`}>
        <td class="no-wordwrap browserName">{server.info.name}</td>
        <td class="is-hidden-mobile no-wordwrap browserType">{server.info.game_type}</td>
        <td class="is-hidden-mobile no-wordwrap browserMap">{server.info.map.name}</td>
        <td class="no-wordwrap browserPlayer has-text-right">
          {server.info.num_players}/{server.info.max_clients}
        </td>
        <td class="no-wordwrap browserLocale has-text-centered">{server.location}</td>
      </tr>
    );
  }
}
