export const VISEMES:string[];
export const AZURE_MAP:string[];
export function validatePack(pack:any):any;
export function safeLocalUrl(value:string,origin?:string):string;
export function timeline(events:any[],durationMs:number):any[];
export function weightsAt(pack:any,frames:any[],elapsedMs:number):Record<string,number>;
export class AudioLane {constructor(factory?:()=>AudioContext);play(buffer:AudioBuffer,onFrame?:(time:number,ended:boolean)=>void):Promise<{state:string}>;stop():void;dispose():Promise<void>}
