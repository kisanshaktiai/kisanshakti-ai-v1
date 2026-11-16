"""Cross-repository integration: real PostgreSQL RPCs + real Python worker, fixture provider."""
import json
import os
import uuid
import psycopg2
import pytest
from psycopg2.extras import Json
from soil_ingestion.worker import process_job
from soil_ingestion.parcel import ALGORITHM, DEPTHS, geometry
from soil_ingestion.sampling import zigzag_plan
from soil_ingestion.ingest import SOILGRIDS

@pytest.fixture
def db():
    conn=psycopg2.connect(os.environ['SOIL_TEST_DATABASE_URL'])
    conn.autocommit=True
    yield conn
    conn.close()

def sql(db,q,args=()):
    with db.cursor() as c:
        c.execute(q,args)
        return c.fetchone()[0] if c.description else None

def setup(db):
    ids=[str(uuid.uuid4()) for _ in range(3)]
    sql(db,"insert into lands(id,tenant_id,farmer_id,name,boundary_geom) values(%s,%s,%s,'Synthetic test',ST_GeomFromText('POLYGON((74.349 16.749,74.351 16.749,74.351 16.751,74.349 16.751,74.349 16.749))',4326))",ids)
    sql(db,"insert into soil_engine_workers(worker_id,source_version,algorithm_version) values(%s,'fixture',%s)",(str(uuid.uuid4()),ALGORITHM))
    return ids

def enqueue(db,ids): return sql(db,'select soil_enqueue(%s,%s,%s,%s,%s)',(*ids,'fixture',ALGORITHM))

def fixture_fetch(geo,source_version,progress,**kwargs):
    parcel,fingerprint=geometry(geo)
    properties={}
    for p,spec in SOILGRIDS.items():
        properties[p]={}
        for d in DEPTHS:
            for stat in ['mean','Q0.05','Q0.5','Q0.95']: progress(f'{p}_{d}_{stat}')
            properties[p][d]={'mean':6.8 if p=='phh2o' else max(1,spec[3]),'unit':spec[1],'quality':'complete'}
    return {'source':'ISRIC_SOILGRIDS','source_version':source_version,'algorithm_version':ALGORITHM,
        'quality':'complete','modelled_not_measured':True,'geometry_fingerprint':fingerprint,
        'requested_properties':list(SOILGRIDS),'requested_depths':list(DEPTHS),
        'sampling':zigzag_plan(parcel),'area_m2':parcel.area,'properties':properties}

class Adapter:
    def __init__(self,db): self.db=db
    def rpc(self,name,**params):
        assert name in ['soil_progress','soil_complete','soil_fail']
        return sql(self.db,'select '+name+'('+','.join(k+' => %s' for k in params)+')',
            tuple(Json(v) if isinstance(v,dict) else v for v in params.values()))

def claim(db,job_id):
    # Make ordering deterministic across independent integration cases.
    sql(db,"update soil_fetch_jobs set created_at=now()-interval '2 days' where id=%s",(job_id,))
    return sql(db,'select soil_claim(%s,%s)',('fixture',ALGORITHM))

def test_click_to_job_to_saved_report_and_cache(db):
    ids=setup(db); sql(db,'set role service_role'); first=enqueue(db,ids)
    assert enqueue(db,ids)['job_id']==first['job_id']
    job=claim(db,first['job_id'])
    assert process_job(Adapter(db),job,fixture_fetch)
    state=sql(db,'select soil_state(%s,%s,%s)',ids)
    assert state['job']['status']=='complete'
    assert state['model']['report']['sampling']['generated_points']==10
    assert float(sql(db,'select ph_level from soil_health where land_id=%s',(ids[0],)))==pytest.approx(6.8)
    assert sql(db,'select nitrogen_kg_per_ha is null and test_date is null from soil_health where land_id=%s',(ids[0],))
    assert enqueue(db,ids)['status']=='cached'
    assert not sql(db,'select soil_complete(%s,%s,%s)',(job['id'],job['lease_token'],Json(state['model']['report'])))

def test_existing_lab_is_not_overwritten(db):
    ids=setup(db)
    sql(db,"insert into soil_health(land_id,tenant_id,farmer_id,source,ph_level,test_date) values(%s,%s,%s,'lab_test',7.2,current_date)",ids)
    job=claim(db,enqueue(db,ids)['job_id'])
    assert process_job(Adapter(db),job,fixture_fetch)
    assert sql(db,'select count(*) from soil_health where land_id=%s',(ids[0],))==1
    assert float(sql(db,'select ph_level from soil_health where land_id=%s',(ids[0],)))==7.2
    assert sql(db,'select count(*) from soil_parcel_reports where land_id=%s',(ids[0],))==1

def test_ownership_and_geometry_change(db):
    ids=setup(db)
    with pytest.raises(psycopg2.Error): enqueue(db,[ids[0],ids[1],str(uuid.uuid4())])
    job=claim(db,enqueue(db,ids)['job_id'])
    sql(db,'update lands set boundary_geom=ST_Translate(boundary_geom,0.001,0) where id=%s',(ids[0],))
    assert not process_job(Adapter(db),job,fixture_fetch)
    assert sql(db,'select error_code from soil_fetch_jobs where id=%s',(job['id'],))=='LAND_CHANGED'
    assert sql(db,'select count(*) from soil_parcel_reports where land_id=%s',(ids[0],))==0

def test_expired_lease_reclaimed_and_old_worker_rejected(db):
    ids=setup(db); job=claim(db,enqueue(db,ids)['job_id'])
    sql(db,"update soil_fetch_jobs set lease_until=now()-interval '1 second' where id=%s",(job['id'],))
    replacement=claim(db,job['id'])
    assert replacement['lease_token']!=job['lease_token']
    assert not sql(db,'select soil_progress(%s,%s,50)',(job['id'],job['lease_token']))
    assert process_job(Adapter(db),replacement,fixture_fetch)

def test_public_roles_cannot_mutate_or_read_queue(db):
    for role in ['anon','authenticated']:
        assert not sql(db,"select has_function_privilege(%s,'soil_claim(text,text)','EXECUTE')",(role,))
        assert not sql(db,"select has_function_privilege(%s,'soil_complete(uuid,uuid,jsonb)','EXECUTE')",(role,))
        assert not sql(db,"select has_table_privilege(%s,'soil_fetch_jobs','SELECT')",(role,))
        assert not sql(db,"select has_table_privilege(%s,'soil_parcel_reports','INSERT')",(role,))


def test_enqueue_without_worker_heartbeat(db):
    """GitHub-hosted runners are ephemeral: queuing must not depend on active workers."""
    ids=setup(db)
    sql(db, 'delete from soil_engine_workers')
    result=enqueue(db, ids)
    assert result['status']=='queued'
    job=claim(db, result['job_id'])
    assert process_job(Adapter(db), job, fixture_fetch)
    assert sql(db, 'select count(*) from soil_parcel_reports where land_id=%s',(ids[0],))==1
