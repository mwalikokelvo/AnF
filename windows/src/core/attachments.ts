export const ATTACHMENT_TYPES = [
  {label:'PDF',accept:'.pdf'},
  {label:'Images',accept:'.png,.jpg,.jpeg'},
  {label:'Code',accept:'.txt,.md,.json,.csv,.log,.js,.ts,.tsx,.jsx,.py,.rs,.html,.css,.java,.c,.cpp,.h,.sql,.yaml,.yml'},
  {label:'Docs',accept:'.docx,.txt,.md,.csv'},
  {label:'EPUB',accept:'.epub'},
] as const;
export const ATTACHMENT_ACCEPT = [...new Set(ATTACHMENT_TYPES.flatMap(t=>t.accept.split(',')))].join(',');
