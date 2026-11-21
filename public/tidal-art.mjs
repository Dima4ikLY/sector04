// Project the supplied illustration to the map once, keeping the painted
// waterfall mouths, bridge and water level aligned to the physics.
const imageWidth=1774,imageHeight=887;
const columns=[[0,0],[378,784],[490,960],[1020,2240],[1110,2416],[1774,3200]];
const rows=[[0,0],[198,324],[303,448],[394,704],[625,1088],[685,1250],[807,1472],[887,1600]];
const originalDeck=[[479,397],[540,417],[644,432],[735,437],[837,435],[928,419],[1019,389]];
const projectedImages=new WeakMap();
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};

// A monotone, continuous curve avoids the sharp changes of resolution at the
// old tile boundaries. Axes are sampled in reverse from world to source pixels.
function sampler(knots){
  const slopes=knots.slice(1).map(([source,world],i)=>(source-knots[i][0])/(world-knots[i][1]));
  const tangents=knots.map((_,i)=>{
    if(i===0)return slopes[0];
    if(i===knots.length-1)return slopes.at(-1);
    return 2*slopes[i-1]*slopes[i]/(slopes[i-1]+slopes[i]);
  });
  let segment=0;
  return world=>{
    while(segment<knots.length-2&&world>knots[segment+1][1])segment++;
    const [startSource,startWorld]=knots[segment];
    const [endSource,endWorld]=knots[segment+1];
    const span=endWorld-startWorld,t=(world-startWorld)/span,t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*startSource+(t3-2*t2+t)*span*tangents[segment]
      +(-2*t3+3*t2)*endSource+(t3-t2)*span*tangents[segment+1];
  };
}

function sampleTable(size,sourceSize,knots,stride,worldSize){
  const project=sampler(knots);
  const indices=new Int32Array(size*4),weights=new Float32Array(size*4);
  for(let dest=0;dest<size;dest++){
    const source=project((dest+.5)*worldSize/size)-.5;
    const base=Math.floor(source),t=source-base,t2=t*t,t3=t2*t,i=dest*4;
    for(let tap=0;tap<4;tap++)indices[i+tap]=clamp(base+tap-1,0,sourceSize-1)*stride;
    weights[i]=-.5*t+t2-.5*t3;
    weights[i+1]=1-2.5*t2+1.5*t3;
    weights[i+2]=.5*t+2*t2-1.5*t3;
    weights[i+3]=-.5*t2+.5*t3;
  }
  return {indices,weights};
}

// Blend only inside the silhouette of the old deck. The undamaged rope rails
// stay in the illustration; the level renderer supplies the destructible boards.
function cleanDeck(pixels,width,height){
  const left=470,right=1030,topEdge=370,bottomEdge=520;
  const patchWidth=right-left,patchHeight=bottomEdge-topEdge;
  const mask=new Uint8Array(patchWidth*patchHeight);
  const patch=new Float32Array(mask.length*3);
  const sourceIndex=(x,y)=>((topEdge+y)*width+left+x)*4;
  function markBand(x,top,bottom){
    const first=clamp(Math.floor(top),1,height-2),last=clamp(Math.ceil(bottom),first,height-2);
    for(let y=first;y<=last;y++){
      mask[(y-topEdge)*patchWidth+x-left]=1;
    }
  }
  let segment=0;
  for(let x=476;x<=1022;x++){
    while(segment<originalDeck.length-2&&x>originalDeck[segment+1][0])segment++;
    const [x1,y1]=originalDeck[segment],[x2,y2]=originalDeck[segment+1];
    const height=y1+(y2-y1)*(x-x1)/(x2-x1);
    const feather=smooth((x-476)/10)*smooth((1022-x)/10);
    markBand(x,height-14*feather,height+22*feather);
  }
  for(let x=824;x<=909;x++){
    const center=492-(x-829)*.70,feather=smooth((x-824)/9)*smooth((909-x)/9);
    markBand(x,center-14*feather,center+15*feather);
  }

  const selected=[];
  for(let x=0;x<patchWidth;x++){
    for(let y=0;y<patchHeight;y++){
      const index=y*patchWidth+x,offset=index*3;
      if(!mask[index]){
        const source=sourceIndex(x,y);
        for(let ch=0;ch<3;ch++)patch[offset+ch]=pixels[source+ch];
        continue;
      }
      // Interpolate from the nearest clean rows to initialize only the edit.
      const start=y;
      while(mask[(y+1)*patchWidth+x])y++;
      const end=y,above=sourceIndex(x,start-1),below=sourceIndex(x,end+1);
      for(let row=start;row<=end;row++){
        const target=(row*patchWidth+x)*3,mix=(row-start+1)/(end-start+2);
        selected.push(target);
        for(let ch=0;ch<3;ch++)patch[target+ch]=pixels[above+ch]*(1-mix)+pixels[below+ch]*mix;
      }
    }
  }
  // Mix along both axes to prevent individual rope pixels on the boundary
  // from being stretched vertically into the freed space beneath the bridge.
  const stride=patchWidth*3;
  for(let pass=0;pass<96;pass++){
    for(const index of selected){
      for(let ch=0;ch<3;ch++){
        const p=index+ch;
        const neighbors=(patch[p-3]+patch[p+3])*1.7+patch[p-stride]+patch[p+stride];
        patch[p]+=1.65*(neighbors/5.4-patch[p]);
      }
    }
  }
  for(const index of selected){
    const pixel=index/3,x=pixel%patchWidth,y=Math.floor(pixel/patchWidth);
    const target=sourceIndex(x,y);
    for(let ch=0;ch<3;ch++)pixels[target+ch]=patch[index+ch];
  }
}

function resample(source,out,width,height,worldWidth,worldHeight){
  const horizontal=new Uint8ClampedArray(width*imageHeight*4);
  const xTable=sampleTable(width,imageWidth,columns,4,worldWidth);
  const yTable=sampleTable(height,imageHeight,rows,width*4,worldHeight);
  for(let y=0;y<imageHeight;y++){
    for(let x=0;x<width;x++)filterPixel(source,horizontal,y*imageWidth*4,y*width*4+x*4,x*4,xTable);
  }
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++)filterPixel(horizontal,out,x*4,(y*width+x)*4,y*4,yTable);
  }
}

function filterPixel(input,output,offset,to,at,{indices,weights}){
  const a=offset+indices[at],b=offset+indices[at+1],c=offset+indices[at+2],d=offset+indices[at+3];
  const wa=weights[at],wb=weights[at+1],wc=weights[at+2],wd=weights[at+3];
  for(let ch=0;ch<3;ch++){
    output[to+ch]=input[a+ch]*wa+input[b+ch]*wb+input[c+ch]*wc+input[d+ch]*wd;
  }
  output[to+3]=255;
}

export function projectTidalArt(canvas,image,map){
  const key=canvas.width*65536+canvas.height;
  let cached=projectedImages.get(image);
  if(cached?.key===key)return cached.art;
  const native=document.createElement('canvas');
  native.width=imageWidth;native.height=imageHeight;
  const original=native.getContext('2d',{willReadFrequently:true});
  original.drawImage(image,0,0,imageWidth,imageHeight);
  const pixels=original.getImageData(0,0,imageWidth,imageHeight);
  cleanDeck(pixels.data,imageWidth,imageHeight);
  const layer=canvas.getContext('2d');
  const result=layer.createImageData(canvas.width,canvas.height);
  resample(pixels.data,result.data,canvas.width,canvas.height,map.width,map.height);
  layer.putImageData(result,0,0);
  // Only cache the full-resolution background; thumbnails use the original PNG.
  if(canvas.width===map.width){
    cached={key,art:canvas};
    projectedImages.set(image,cached);
  }
  return canvas;
}
