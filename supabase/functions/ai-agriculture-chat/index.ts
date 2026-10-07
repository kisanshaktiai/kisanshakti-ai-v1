          console.error(`   source: index.ts`);
          
          // PRIORITY 1: Check for layered_rule_result.primary_decision (NEW CONTRACT)
          const layeredPrimaryDecision = rawDecisionOutput.layered_rule_result?.primary_decision;
          
          // BUG-1/BUG-6 FIX: Safety gate rules must NEVER be selected as
          const SAFETY_GATE_RULE_PATTERN = /^GLOBAL_SAFETY/i;
          const isSafetyGateRule = (ruleId?: string) => 
            !!(ruleId && SAFETY_GATE_RULE_PATTERN.test(ruleId));
          
          const isLayeredSafetyGate = isSafetyGateRule(layeredPrimaryDecision?.rule_id);
          const isContextConstraint = (row: any) => {
            const actionType = String(row?.action_type ?? '').trim().toUpperCase();
            const triggerClass = String(row?.trigger_class ?? '').trim().toUpperCase();
            return actionType === 'BLOCK' || triggerClass === 'CONTEXT_BLOCK';
          };
          
          if (layeredPrimaryDecision && layeredPrimaryDecision.rule_id && (layeredPrimaryDecision as any).action_type && !isLayeredSafetyGate && !isContextConstraint(layeredPrimaryDecision)) {
            console.log(`   🔄 RECOVERY: Using layered_rule_result.primary_decision`);
            
            // BUG-1 FIX: Never set placeholder product_name — leave null for formatter
            const recoveredProductName = (layeredPrimaryDecision as any).product_name || null;
            const recoveredProductType = (layeredPrimaryDecision as any).product_type || null;
            
            (rawDecisionOutput as any).primary_decision = {
              action_type: (layeredPrimaryDecision as any).action_type,
              rule_id: layeredPrimaryDecision.rule_id,
              specific_action: (layeredPrimaryDecision as any).action_type,
              target: {},
              urgency: 'WITHIN_24H',
              priority: layeredPrimaryDecision.priority,
              // SSOT: Propagate ledger-derived confidence
              weighted_confidence: (layeredPrimaryDecision as any).weighted_confidence,
              normalized_score: (layeredPrimaryDecision as any).normalized_score,
              timing: {
                recommended_start: new Date().toISOString(),
                recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                weather_dependency: false,
                reason: null as any
              },
              provenance: 'Recovered from layered_rule_result.primary_decision',
              application_details: buildRichApplicationDetails(layeredPrimaryDecision, recoveredProductName, recoveredProductType) as any,
              expected_outcomes: {
                efficacy_percent: (layeredPrimaryDecision as any).weighted_confidence 
                  ? Math.round((layeredPrimaryDecision as any).weighted_confidence * 100) : 75,
                time_to_visible_effect_days: '3-5',
                success_indicators: (layeredPrimaryDecision as any).success_indicators || []
              }
            };
            
            console.log(`   ✅ Primary decision RECOVERED: rule_id=${layeredPrimaryDecision.rule_id}, action_type=${(layeredPrimaryDecision as any).action_type}`);
          } else if (isLayeredSafetyGate) {
            console.warn(`   ⚠️ SAFETY_GATE_FILTER: Skipping GLOBAL_SAFETY rule ${layeredPrimaryDecision?.rule_id} as primary — moving to warnings`);
            // Move safety gate rule to warnings instead
            if (!rawDecisionOutput.warnings) rawDecisionOutput.warnings = [];
            (rawDecisionOutput.warnings as any[]).push({
              type: 'SAFETY_GATE',
              rule_id: layeredPrimaryDecision?.rule_id,
              message: layeredPrimaryDecision?.action_text || 'Safety precaution applies',
              source: 'safety_gate_filter'
            });
          }
          // PRIORITY 2: Check for primary_matched_response (LEGACY)
          else {
            const primaryMatchedResponse = rawDecisionOutput.primary_matched_response;
            const isPrimaryMatchSafetyGate = isSafetyGateRule(primaryMatchedResponse?.rule_id);
            
            if (primaryMatchedResponse && primaryMatchedResponse.rule_id && (primaryMatchedResponse as any).action_type && !isPrimaryMatchSafetyGate && !isContextConstraint(primaryMatchedResponse)) {
              console.log(`   🔄 RECOVERY: Using primary_matched_response (legacy)`);
              
              (rawDecisionOutput as any).primary_decision = {
                action_type: (primaryMatchedResponse as any).action_type,
                rule_id: primaryMatchedResponse.rule_id,
                specific_action: (primaryMatchedResponse as any).action_type,
                target: {},
                urgency: 'WITHIN_24H',
                priority: primaryMatchedResponse.priority,
                weighted_confidence: (primaryMatchedResponse as any).weighted_confidence,
                timing: {
                  recommended_start: new Date().toISOString(),
                  recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                  weather_dependency: false,
                  reason: 'Recovered from primary_matched_response'
                },
                application_details: buildRichApplicationDetails(primaryMatchedResponse, (primaryMatchedResponse as any).product_name || null, (primaryMatchedResponse as any).product_type || null) as any,
                expected_outcomes: {
                  efficacy_percent: (primaryMatchedResponse as any).weighted_confidence 
                    ? Math.round((primaryMatchedResponse as any).weighted_confidence * 100) : 75,
                  time_to_visible_effect_days: '3-5',
                  success_indicators: (primaryMatchedResponse as any).success_indicators || []
                }
              };
              
              console.log(`   ✅ Primary decision RECOVERED: rule_id=${primaryMatchedResponse.rule_id}, action_type=${(primaryMatchedResponse as any).action_type}`);
            } else if (isPrimaryMatchSafetyGate) {
              console.warn(`   ⚠️ SAFETY_GATE_FILTER: Skipping safety rule ${primaryMatchedResponse?.rule_id} from primary_matched_response`);
            }
            // PRIORITY 3: Check matched_responses array
            else {
              // PRODUCTION FIX: Empty array is truthy — use strict length check
              const rawMatched = rawDecisionOutput.matched_responses;
              const layeredMatched = rawDecisionOutput.layered_rule_result?.matched_responses;
              const matchedResponses = (Array.isArray(rawMatched) && rawMatched.length > 0)
                ? rawMatched
                : (Array.isArray(layeredMatched) && layeredMatched.length > 0)
                  ? layeredMatched
                  : [];
              
              // PRODUCTION FIX: Align eligibility with layered-rule-evaluator.ts
              const eligibleResponses = matchedResponses.filter((r: any) => 
                r.rule_id &&
                r.action_type &&
                (r.action_text || r.i18n_key || r.reason_text || r.knowledge_text) &&
                !isSafetyGateRule(r.rule_id) &&
                !isContextConstraint(r)
              );
              
              if (eligibleResponses.length > 0) {
                console.log(`   🔄 RECOVERY: Using eligible matched_response (${eligibleResponses.length} available)`);
                
                const firstMatch = eligibleResponses[0];
                (rawDecisionOutput as any).primary_decision = {
                  action_type: (firstMatch as any).action_type,
                  rule_id: firstMatch.rule_id,
                  specific_action: firstMatch.cause || 'Recommendation',
                  target: {},
                  urgency: 'WITHIN_24H',
                  priority: firstMatch.priority,
                  weighted_confidence: (firstMatch as any).weighted_confidence,
                  timing: {
                    recommended_start: new Date().toISOString(),
                    recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                    weather_dependency: false,
                    reason: 'Recovered from matched responses'
                  },
                  application_details: buildRichApplicationDetails(firstMatch, (firstMatch as any).product_name || null, (firstMatch as any).product_type || null) as any,
                  expected_outcomes: {
                    efficacy_percent: (firstMatch as any).weighted_confidence 
                      ? Math.round((firstMatch as any).weighted_confidence * 100) : 75,
                    time_to_visible_effect_days: '3-5',
                    success_indicators: (firstMatch as any).success_indicators || []
                  }
                };
                
                console.log(`   ✅ Primary decision RECOVERED: rule_id=${firstMatch.rule_id}, action_type=${(firstMatch as any).action_type}`);
              } else {
                // PRIORITY 4: No eligible responses - generate system fallback
                // PRODUCTION OBSERVABILITY: Log full diagnostic context before fallback
                const rawMatchedCount = Array.isArray(rawDecisionOutput.matched_responses) ? rawDecisionOutput.matched_responses.length : 0;
                const layeredMatchedCount = Array.isArray(rawDecisionOutput.layered_rule_result?.matched_responses) ? rawDecisionOutput.layered_rule_result.matched_responses.length : 0;