import m from 'mithril';
import { init } from './appstate';
import navbar from '@/navbar';

// 标准布局模版
const LAYOUT: any = (vnode: m.Vnode) => [vnode];
const RAW: any = (vnode: m.Vnode) => vnode;

// 页面解析缩写
export const PAGE = (
  component: string,
  render: m.RouteResolver['render'] | 'raw' | 'layout' = 'layout'
): m.RouteResolver => ({
  onmatch: async () => {
    return (await import(`@/${component}`)).default;
  },
  render: typeof render == 'string' ? (render == 'layout' ? LAYOUT : RAW) : render,
});

export const INIT = () => {
  // 生产环境取消Hashbang
  if (!__DEV) {
    m.route.prefix = '';
  }
  init();
};

export const ENTER = (func: Function) => {
  return (e: any) => {
    if (e?.key == 'Enter' || e?.keyCode == 13 || e?.which == 13) {
      func();
    }
  };
};
