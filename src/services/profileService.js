import {apiRequest} from './apiClient.js';
export async function getMyProfile(){
  try{const profile=await apiRequest('/me/profile');return profile?.error?{success:false,message:profile.error}:{success:true,profile};}
  catch(e){return {success:false,message:e.message};}
}
export async function updateMyProfile(fields){
  const names={fullName:'full_name',phone:'phone',birthday:'birthday',gender:'gender',address:'address',bio:'bio',avatarUrl:'avatar_url'};
  const body=Object.fromEntries(Object.entries(names).filter(([key])=>fields[key]!==undefined).map(([key,column])=>[column,fields[key]?.trim()||null]));
  try{const profile=await apiRequest('/me/profile',{method:'PATCH',body});return profile?.error?{success:false,message:profile.error}:{success:true,profile};}
  catch(e){return {success:false,message:e.message};}
}
