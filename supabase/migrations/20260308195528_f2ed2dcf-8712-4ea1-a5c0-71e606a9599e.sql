-- Fix contaminated dosage_per_acre values where chemical in dosage doesn't match active_ingredient

-- SC_PEST_TOP_BORER_004: active_ingredient is Chlorpyrifos 20% EC, but dosage says Fipronil
UPDATE public.decision_rules 
SET dosage_per_acre = 'Chlorpyrifos 20% EC @ 500ml/acre in 200L water',
    updated_at = now()
WHERE rule_id = 'SC_PEST_TOP_BORER_004';

-- SC_DISEASE_SMUT_004: active_ingredient is Propiconazole 25% EC, but dosage says Triadimefon
UPDATE public.decision_rules 
SET dosage_per_acre = 'Propiconazole 25% EC @ 200ml/acre in 200L water',
    updated_at = now()
WHERE rule_id = 'SC_DISEASE_SMUT_004';