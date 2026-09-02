    // Invalid/unavailable LLM output falls back to the deterministic sequence.
    let harnessTrace: Record<string, unknown> | null = null;
    try {
      const harnessFlag = await isFlagEnabled(supabase, "crop_schedule_harness_v2", { tenantId, farmerId });
      if (harnessFlag.enabled) {
        const harnessed = await applyScheduleHarness(baseline.tasks, {
          cropCode: inputs.cropCode,
          cultivationMethod: inputs.cultivationMethod,
          cropCycle: inputs.cropCycle,
          gaps: baseline.gaps,
        });
        if (!harnessed.result.applied || harnessed.result.status !== "READY") {
          return json({
            error: "Schedule harness failed closed before persistence",
            code: "HARNESS_VALIDATION_FAILED",
            trace: harnessed.result.trace,
          }, 422);
        }
        baseline.tasks.splice(0, baseline.tasks.length, ...harnessed.tasks);
        harnessTrace = harnessed.result.trace;
      }
    } catch {
      return json({ error: "Schedule harness execution failed before persistence", code: "HARNESS_FAILURE" }, 422);
    }

    // ── PHASE 2 / P1: verified RAG evidence attachment (flag-gated) ─────────
    // Runs AFTER the deterministic baseline so RAG can only annotate, never
    // generate. belowThreshold / unservable ⇒ explicit NO_EVIDENCE on the task.
    let ragEvidence: RagEvidenceSummary | null = null;
    try {
      const ragFlag = await isFlagEnabled(supabase, "rag_schedule_evidence", { tenantId, farmerId });
      if (ragFlag.enabled) {
        ragEvidence = await attachRagEvidence(supabase, baseline.tasks, {
          cropCode: inputs.cropCode,
          cropLabel: inputs.cropLabel || cropName,
          regionCode: inputs.regionCode,
          tenantId,
          farmerId,
        });
        baseline.coverage.rag_evidence =
          ragEvidence.tasks_evidenced > 0 &&
          ragEvidence.tasks_no_evidence === 0 &&
          ragEvidence.tasks_not_evaluated === 0;
        if (ragEvidence.tasks_no_evidence > 0) {
          baseline.gaps.push(
            `rag_evidence: ${ragEvidence.tasks_no_evidence} task(s) have no corpus evidence (explicit NO_EVIDENCE)`,
          );
        }
      }
    } catch (e) {
      console.error("rag-evidence attachment failed (non-fatal):", e);
    }

    // ── Narration (translation only) ────────────────────────────────────────
    const narration = await narrateTasks(
      baseline.tasks.map((t) => ({
        task_name: t.task_name,
        task_description: t.task_description,
        instructions: t.instructions,
      })),
      language,
    );
    const narrated = narration.tasks;
    if (!narration.narrated && narration.reason && narration.reason !== "no_translation_needed") {
      baseline.gaps.push(`narration_unavailable: ${narration.reason}`);
      baseline.coverage.narration = false;
    } else if (language !== "en") {
      baseline.coverage.narration = true;
    }

    // ── Persist ─────────────────────────────────────────────────────────────
    const sow = new Date(inputs.sowingDate);
    const durationDays = baseline.totals.duration_days;
    const harvestDateStr = durationDays
      ? new Date(sow.getTime() + durationDays * 86400000).toISOString().split("T")[0]
      : null;

    const { data: savedSchedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .insert({
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        crop_name: inputs.cropLabel || cropName,
        crop_variety: inputs.varietyName,
        variety_id: inputs.varietyId,
        // P0-A: canonical stage-clock method — the DB phenology resolvers exact-match
        // this stored value against crop_stage_master (schedule is SSOT for method).
        cultivation_method: inputs.stageClockMethod ?? inputs.cultivationMethod,
        crop_cycle: inputs.cropCycle,
        sowing_date: inputs.sowingDate,
        transplant_date: inputs.transplantDate,
        expected_harvest_date: harvestDateStr,
        is_active: true,
        status: "active",
        generation_language: narration.narrated ? language : "en",
        ai_model: narration.narrated ? `${narration.provider ?? "unknown"}/${narration.model ?? "unknown"} (narration only)` : "none",
        calculated_for_area_acres: inputs.landAreaAcres,
        total_duration_days: durationDays,
        seed_quantity_kg: baseline.totals.seed_kg,
        fertilizer_n_kg: baseline.totals.n_kg,
        fertilizer_p_kg: baseline.totals.p_kg,
        fertilizer_k_kg: baseline.totals.k_kg,
        total_estimated_cost: baseline.totals.estimated_cost,
        state_region: inputs.state,
        district_name: inputs.district,
        farming_type: farmingType,
        tasks_total_count: baseline.tasks.length,
        tasks_completed_count: 0,
        backdated_consent: !!backdatedConsent,
        backdated_consent_at: backdatedConsent ? new Date().toISOString() : null,
        generation_params: {
          generator_version: GENERATOR_VERSION,
          resolved_inputs: inputs,
          harness: harnessTrace,
          narration: {
            requested_language: language,
            persisted_language: narration.narrated ? language : "en",
            applied: narration.narrated,
            reason: narration.reason ?? null,
          },
        },
        metadata: {
          coverage: baseline.coverage,
          missing_sections: Object.entries(baseline.coverage).filter(([, ok]) => ok === false).map(([k]) => k),
          gaps: baseline.gaps,
          provenance: baseline.provenance,
          rag_evidence: ragEvidence,
        },
      })
      .select()
      .single();

    if (scheduleError) {
      if ((scheduleError.message || "").includes("LAND_NOT_AVAILABLE")) {
        return json(
          {
            success: false,
            error:
              "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.",
            code: "LAND_NOT_AVAILABLE",
            landId,
          },
          200,
        );
      }
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    const tasksToInsert = baseline.tasks.map((t, idx) => ({
      schedule_id: savedSchedule.id,
      farmer_id: farmerId,
      tenant_id: tenantId,
      task_name: narrated[idx]?.task_name || t.task_name,
      task_description: narrated[idx]?.task_description || t.task_description,
      task_type: t.task_type,
      task_date: new Date(sow.getTime() + t.days_from_sowing * 86400000).toISOString().split("T")[0],
      projected_date: new Date(sow.getTime() + t.days_from_sowing * 86400000).toISOString().split("T")[0],
      days_from_sowing: t.days_from_sowing,
      anchor_type: t.anchor_type,
      anchor_stage: t.anchor_stage,
      gdd_target: t.gdd_target,
      stage_key: t.stage_key,
      stage_uuid: t.stage_uuid ?? null,
      stage_name: t.stage_name,
      stage_order: t.stage_order,
      priority: t.priority,
      weather_dependent: t.weather_dependent,
      status: "pending",
      sequence_order: idx + 1,
      instructions: narrated[idx]?.instructions || t.instructions,
      precautions: t.precautions ?? [],
      // v1.5.0: recurring tasks (irrigation window, weekly scouting) carry their cadence
      // in resources.recurrence instead of being expanded into one dated row per event.
      resources: {
        ...(t.resources ?? {}),
        ...(t.quantity ? { quantity: t.quantity } : {}),
        ...(t.recurrence ? { recurrence: t.recurrence } : {}),
      },

      estimated_cost: t.estimated_cost,
      currency: "INR",
      rule_ids: t.rule_ids,
      trigger_rule_id: t.rule_ids[0] || null,
      confidence: t.confidence,
      source_refs: t.source_refs,
      language: narration.narrated ? language : "en",
      is_pinned: false,
    }));

    const { error: tasksError } = await supabase.from("schedule_tasks").insert(tasksToInsert);
    if (tasksError) throw new Error(`Failed to save tasks: ${tasksError.message}`);

    await supabase
      .from("lands")
      .update({
        current_crop: inputs.cropLabel || cropName,
        current_crop_variety_id: inputs.varietyId,
        planting_date: inputs.sowingDate,
        transplant_date: inputs.transplantDate,
        // P0-RC5: DAS clock and GDD clock start on the same day (accumulator precedence:
        // transplant → planting). current_gdd is cleared so a stale sum from the previous
        // cycle can never feed the stage engine before the rebuild.
        gdd_anchor_type: inputs.transplantDate ? "transplant" : "planting",
        gdd_anchor_date: inputs.transplantDate ?? inputs.sowingDate,
        current_gdd: null,
        gdd_last_computed_at: null,
        expected_harvest_date: harvestDateStr,
        active_schedule_id: savedSchedule.id,
        crop_cycle: inputs.cropCycle,
        updated_at: new Date().toISOString(),
      })
      .eq("id", landId);

    // Sections the agronomic database could not cover for this crop. They are returned
    // explicitly so the app can render them as "pending" instead of silently omitting them.
    const missingSections = Object.entries(baseline.coverage)
      .filter(([, ok]) => ok === false)
      .map(([key]) => key);
    const missingSectionLabelKeys = missingSections.map((k) => `schedule.section_pending.${k}`);

    const httpStatus = 200;
    // Observability: log this invocation to edge_invocation_logs. Wrapped so a logging
    // failure never breaks generation — the schedule still returns to the farmer.
    try {
      await supabase.from("edge_invocation_logs").insert({
        function_name: "ai-smart-schedule",
        user_id: farmerId || null,
        payload: {
          landId,
          cropCode: inputs.cropCode,
          http_status: httpStatus,
          task_count: baseline.tasks.length,
          gaps: baseline.gaps,
          coverage: baseline.coverage,
          execution_time_ms: Date.now() - startTime,
        },
      });
    } catch (logErr) {
      console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr);
    }

    return json({
      success: true,
      scheduleId: savedSchedule.id,
      landId,
      cropCode: inputs.cropCode,
      cropName: inputs.cropLabel || cropName,
      translatedCropName: inputs.cropLabelLocal,
      varietyId: inputs.varietyId,
      cultivationMethod: inputs.cultivationMethod,
      sowingDate: inputs.sowingDate,
      language,
      totalTasks: baseline.tasks.length,
      totals: baseline.totals,
      coverage: baseline.coverage,
      missing_sections: missingSections,
      missing_section_label_keys: missingSectionLabelKeys,
      gaps: baseline.gaps,
      generatorVersion: GENERATOR_VERSION,
      harness: harnessTrace,
      narrationApplied: narration.narrated,
      executionTimeMs: Date.now() - startTime,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const landNotAvailable = errorMessage.includes("LAND_NOT_AVAILABLE");

    if (!landNotAvailable) {
      console.error("❌ [ai-smart-schedule] Error:", error);
    }
    // Observability on failure too — best effort, never blocks the error response.
    try {
      const logClient = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );
      await logClient.from("edge_invocation_logs").insert({
        function_name: "ai-smart-schedule",
        user_id: farmerId || null,
        payload: {
          landId,
          cropCode: resolvedCropCode ?? cropName,
          http_status: landNotAvailable ? 200 : 500,
          domain_code: landNotAvailable ? "LAND_NOT_AVAILABLE" : null,
          task_count: 0,
          error: errorMessage,
          execution_time_ms: Date.now() - startTime,
        },
      });
    } catch (logErr) {
      console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr);
    }
    if (landNotAvailable) {
      return json(
        {
          success: false,
          error:
            "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.",
          code: "LAND_NOT_AVAILABLE",
          landId,
          executionTimeMs: Date.now() - startTime,
        },
        200,
      );
    }

    return json({ error: errorMessage || "Schedule generation failed", executionTimeMs: Date.now() - startTime }, 500);
  }
});