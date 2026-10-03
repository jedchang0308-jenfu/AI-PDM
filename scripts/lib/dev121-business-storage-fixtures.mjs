// Synthetic values, shaped like Terraform 1.14.5 / Google 7.45.0 observations.
// No production data or provenance: real owner proofs remain separate.
import fs from 'node:fs';
export const profile=JSON.parse(fs.readFileSync(new URL('../../config/release/dev121-business-storage-plan.json',import.meta.url),'utf8'));
export const expectedInputs={source_revision:'a'.repeat(40),foundation_manifest_sha256:'b'.repeat(64),application_image_digest:'sha256:'+'c'.repeat(64),migration_runner_image_digest:'sha256:'+'d'.repeat(64)};
const addresses=profile.profiles.BUSINESS_STORAGE.addresses;
function values(){return [
 {project_id:'jenfu-platform-prod',number:'9536592944'},
 {project:'jenfu-platform-prod',account_id:'aipdm-prod-runtime',email:profile.target.runtimeIdentity},
 {project:'jenfu-platform-prod',name:profile.target.bucket,location:'ASIA-EAST1',storage_class:'STANDARD',uniform_bucket_level_access:true,public_access_prevention:'enforced',force_destroy:false,soft_delete_policy:[{retention_duration_seconds:2592000}],lifecycle_rule:[],retention_policy:[],website:[],cors:[],requester_pays:false,versioning:[{enabled:false}]},
 {project:'jenfu-platform-prod',role_id:'aipdmBusinessImmutableObjects',stage:'GA',permissions:['storage.objects.create','storage.objects.get'],deleted:false},
 {bucket:'b/'+profile.target.bucket,id:'b/'+profile.target.bucket+'/projects/jenfu-platform-prod/roles/aipdmBusinessImmutableObjects/serviceAccount:'+profile.target.runtimeIdentity,role:'projects/jenfu-platform-prod/roles/aipdmBusinessImmutableObjects',member:'serviceAccount:'+profile.target.runtimeIdentity,condition:[]}
];}
function identity(address){const data=address.startsWith('data.');const parts=address.split('.');return {address,mode:data?'data':'managed',type:parts[data?1:0],name:parts[data?2:1],provider_name:'registry.terraform.io/hashicorp/google'};}
export function businessStorageStateFixture(){const all=values();return {values:{root_module:{resources:addresses.map((address,index)=>({...identity(address),values:all[index]}))}}};}
export function businessStoragePlanFixture({noOp=false}={}){
 const all=values();
 if(!noOp){delete all[2].website;delete all[3].deleted;all[4].bucket=profile.target.bucket;delete all[4].id;}
 const resource_changes=addresses.slice(2).map((address,index)=>({...identity(address),change:{actions:[noOp?'no-op':'create'],before:noOp?structuredClone(all[index+2]):null,after:all[index+2],after_unknown:noOp?{}:index===0?{website:true,versioning:[{enabled:false}],soft_delete_policy:[{effective_time:true}]}:index===1?{deleted:true,permissions:[false,false]}:{id:true,condition:[]}}}));
 const configuration={root_module:{resources:addresses.map(address=>{const {provider_name,...row}=identity(address);return {...row,provider_config_key:'google',expressions:address===addresses[2]?{versioning:[{enabled:{constant_value:false}}]}:{}};})}};
 return {format_version:'1.2',terraform_version:'1.14.5',complete:true,errored:false,variables:Object.fromEntries(Object.entries(expectedInputs).map(([key,value])=>[key,{value}])),configuration,
   prior_state:{values:{root_module:{resources:businessStorageStateFixture().values.root_module.resources.slice(0,noOp?5:2)}}},
   planned_values:{root_module:{resources:resource_changes.map(row=>({...identity(row.address),values:structuredClone(row.change.after)}))}},resource_changes};
}
