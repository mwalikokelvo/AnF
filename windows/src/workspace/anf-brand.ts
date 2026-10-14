// Shared AnF identity. SVGs are local and decorative; button text supplies names.
const paths:Record<string,string>={
  home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  chat:'M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0ZM8 10h8M8 14h5',
  documents:'M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h6',
  writing:'m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5',
  music:'M9 18V5l12-2v13M9 7l12-2M9 18c0 4-7 4-7 0s7-4 7 0Zm12-2c0 4-7 4-7 0s7-4 7 0Z',
  audio:'M3 10v4M7 6v12M12 3v18M17 7v10M21 10v4',
  settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  menu:'M4 6h16M4 12h16M4 18h16',
};
export function sectionIcon(id:string){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');
  svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('nav-icon');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[id]||paths.home);svg.append(path);return svg;
}
export function wordmark(){
  const brand=document.createElement('div');brand.className='brand';brand.setAttribute('aria-label','AnF');
  const mark=document.createElement('span');mark.className='brand-mark';mark.textContent='AF';mark.setAttribute('aria-hidden','true');
  const name=document.createElement('strong');name.textContent='AnF';brand.append(mark,name);return brand;
}
