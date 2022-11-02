import m from 'mithril';
import { PAGE, INIT } from './utils';

(m as any).Fragment = '[';

INIT();

//-----------------
// 从这里开始添加内容
//-----------------

// 全局资源
import '@fortawesome/fontawesome-free/scss/fontawesome.scss';
import '@fortawesome/fontawesome-free/scss/solid.scss';
import '@fortawesome/fontawesome-free/scss/brands.scss';
import 'styles/main.scss';

// 页面
// TODO: 设计Layout模版后就可以删掉'raw'了
m.route(document.body, '/', {
  '/p/:map': PAGE('preview_redirect', 'raw'),
  '/l/:link': PAGE('link', 'raw'),
  '/browser': PAGE('browser', 'raw'),
  '/points': PAGE('points', 'raw'),
  '/points/:player': PAGE('points', 'raw'),
  '/': PAGE('home', 'raw'),
});
