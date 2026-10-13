export const VISEMES:string[];
export const AZURE_MAP:string[];
export function validatePack(pack:any):any;
export type CameraPreset = { zoom:number; lift:number; framing:string };
type Point = { x:number; y:number; z:number };
export function cameraPreset(pack:any):CameraPreset;
export function placeCamera(position:Point,target:Point,preset:CameraPreset,frameHeight:number):{position:Point;target:Point};
export function safeLocalUrl(value:string,origin?:string):string;
export function timeline(events:any[],durationMs:number):any[];
export function weightsAt(pack:any,frames:any[],elapsedMs:number):Record<string,number>;
export class AudioLane {constructor(factory?:()=>AudioContext);play(buffer:AudioBuffer,onFrame?:(time:number,ended:boolean)=>void):Promise<{state:string}>;stop():void;dispose():Promise<void>}
