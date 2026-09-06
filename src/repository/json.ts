import { AppStoreError } from '../errors.js';
export function parseJson(text:string):unknown {
  let position=0;
  const whitespace=():void=>{while(/[\t\n\r ]/.test(text[position]??'!'))position++;};
  const invalid=():never=>{throw new AppStoreError('invalidJson','Invalid JSON; use strict JSON with unique keys and depth at most 64.');};
  function string():string {
    const start=position++;while(position<text.length){const char=text[position++];if(char==='\\'){position++;continue;}if(char==='"'){try{return JSON.parse(text.slice(start,position)) as string;}catch{invalid();}}}return invalid();
  }
  function value(depth:number):unknown {
    if(depth>64)invalid();whitespace();const char=text[position];
    if(char==='"')return string();
    if(char==='{'){
      position++;const result:Record<string,unknown>=Object.create(null);whitespace();if(text[position]==='}'){position++;return result;}
      for(;;){whitespace();if(text[position]!=='"')invalid();const key=string();if(Object.hasOwn(result,key))throw new AppStoreError('duplicateKey','JSON object contains a duplicate key.');whitespace();if(text[position++]!==':')invalid();result[key]=value(depth+1);whitespace();const delimiter=text[position++];if(delimiter==='}')return result;if(delimiter!==',')invalid();}
    }
    if(char==='['){position++;const result:unknown[]=[];whitespace();if(text[position]===']'){position++;return result;}for(;;){result.push(value(depth+1));whitespace();const delimiter=text[position++];if(delimiter===']')return result;if(delimiter!==',')invalid();}}
    const match=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(position));if(!match)invalid();position+=match![0].length;const result:unknown=JSON.parse(match![0]);if(typeof result==='number'&&!Number.isFinite(result))invalid();return result;
  }
  const result=value(0);whitespace();if(position!==text.length)invalid();return result;
}
