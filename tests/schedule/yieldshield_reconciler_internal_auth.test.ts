import { describe,expect,it,vi } from "vitest";
import {
  authorizeReconciler,parseSweepBearer,matchesInternalSecret,canPersistMonitoring,
} from "../../supabase/functions/schedule-reconciler/internal-auth";

const req=(value:string|null,extra:Record<string,string>={})=>{
  const headers=new Headers(extra);
  if(value!==null)headers.set("authorization",value);
  return {headers};
};

describe("YieldShield reconciler internal auth contract",()=>{
  it("rejects missing, malformed and oversized bearer tokens",()=>{
    expect(parseSweepBearer(null)).toBeNull();
    expect(parseSweepBearer("Basic key")).toBeNull();
    expect(parseSweepBearer("Bearer")).toBeNull();
    expect(parseSweepBearer("Bearer x y")).toBeNull();
    expect(parseSweepBearer("Bearer "+"z".repeat(1025))).toBeNull();
    expect(parseSweepBearer("bearer valid_123")).toBe("valid_123");
  });
  it("performs opaque bounded comparisons and rejects absent secrets",()=>{
    expect(matchesInternalSecret("abc","abc")).toBe(true);
    expect(matchesInternalSecret("abd","abc")).toBe(false);
    expect(matchesInternalSecret("abc","")).toBe(false);
    expect(matchesInternalSecret("abc",null)).toBe(false);
    expect(matchesInternalSecret("a".repeat(1025),"a".repeat(1025))).toBe(false);
  });
  it("rejects anonymous browser headers even with impersonated farmer IDs",async()=>{
    const vault=vi.fn(async()=>"cron_private");
    expect(await authorizeReconciler(req(null,{"apikey":"public-anon","x-farmer-id":"random","x-tenant-id":"random"}),"service_private",vault)).toBe(false);
    expect(vault).not.toHaveBeenCalled();
  });
  it("rejects an anon bearer token and makes no authorization on apikey alone",async()=>{
    const vault=vi.fn(async()=>"cron_private");
    expect(await authorizeReconciler(req("Bearer public-anon",{"apikey":"public-anon"}),"service_private",vault)).toBe(false);
    expect(vault).toHaveBeenCalledTimes(1);
  });
  it("accepts a genuine service credential without retrieving vault secrets",async()=>{
    const vault=vi.fn(async()=>"cron_private");
    expect(await authorizeReconciler(req("Bearer service_private"),"service_private",vault)).toBe(true);
    expect(vault).not.toHaveBeenCalled();
  });
  it("accepts a valid cron vault credential",async()=>{
    const vault=vi.fn(async()=>"cron_private");
    expect(await authorizeReconciler(req("Bearer cron_private"),"service_private",vault)).toBe(true);
    expect(vault).toHaveBeenCalledTimes(1);
  });
  it("fails closed on secret retrieval failures, blank secrets and malformed header",async()=>{
    expect(await authorizeReconciler(req("Bearer unknown"),"service_private",async()=>{throw new Error("db unavailable")})).toBe(false);
    expect(await authorizeReconciler(req("Bearer unknown"),"service_private",async()=>null)).toBe(false);
    const vault=vi.fn(async()=>"cron_private");
    expect(await authorizeReconciler(req("Bearer cron_private other"),"service_private",vault)).toBe(false);
    expect(vault).not.toHaveBeenCalled();
  });
  it("keeps both task data and monitoring unchanged in dry-run mode",()=>{
    expect(canPersistMonitoring(true)).toBe(false);
    expect(canPersistMonitoring(false)).toBe(true);
  });
});
