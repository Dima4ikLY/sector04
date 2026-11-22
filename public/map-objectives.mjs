import {mapWithMechanisms} from './map-interactives.mjs';
import {isConcealedFrom} from './covers.mjs';
import {theaterObjective} from './mission-theater.mjs';
import {gardenObjective} from './mission-garden.mjs';
import {atlasObjective} from './mission-atlas.mjs';

const objectives={
  theater:theaterObjective,
  garden:gardenObjective,
  atlas:atlasObjective
};

export const getMapObjective=map=>objectives[map.objective];

export function physicalArena(map,mechanisms,bridgeHealth,objective){
  const scene=mapWithMechanisms(map,mechanisms,bridgeHealth);
  return objective ? getMapObjective(map)?.geometry?.(scene,objective)??scene : scene;
}

export function isArenaConcealed(map,state,viewer,target){
  const objective=state&&getMapObjective(map);
  if(objective?.visible?.(map,state,target))return false;
  const isActive=objective?.concealment?cover=>objective.concealment(map,state,cover):undefined;
  return !!objective?.concealed?.(map,state,viewer,target)||isConcealedFrom(map,viewer,target,isActive);
}
