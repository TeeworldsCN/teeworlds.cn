/* 
  链接重定向
  页面作者: TsFreddie
*/

import m from 'mithril';

interface Attr {
  link: string;
}
type CVnode = m.CVnode<Attr>;

export default class implements m.ClassComponent<Attr> {
  link: string = null;

  redirect = (url: string) => {
    window.location.replace(url);
  };
  constructor({ attrs: { link } }: CVnode) {
    this.link = link;
    document.title = `跳转 - Teeworlds中文社区`;
  }

  oncreate() {
    this.redirect(this.link);
  }

  view() {
    return (
      <div>
        正在向 <a herf={this.link}>{this.link}</a> 进发
      </div>
    );
  }
}
