/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFE RENDER UTILITIES - Prevent React Error #31
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * React error #31 occurs when an object is passed as a React child.
 * The AI decision brain can return ActionTiming objects like:
 *   { reason, recommended_start, recommended_end, weather_dependency }
 * instead of plain strings. This utility flattens any such object to a string.
 */

/**
 * Safely converts any value to a renderable string.
 * Handles ActionTiming objects, nested objects, arrays, null/undefined.
 */
export function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  
  if (Array.isArray(val)) {
    return val.map(v => safeString(v)).filter(Boolean).join(', ');
  }
  
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    
    // ActionTiming shape guard: never surface obj.reason (internal provenance)
    if ('recommended_start' in obj || 'recommended_end' in obj) {
      const timingCandidates = [obj.recommended_start, obj.fallback_text];
      for (const c of timingCandidates) {
        if (typeof c === 'string' && c.trim()) return c;
      }
      return '';
    }
    
    // Priority extraction for known ActionTiming-like objects
    const candidates = [
      obj.reason,
      obj.fallback_text,
      obj.recommended_start,
      obj.text,
      obj.label,
      obj.name,
      obj.title,
      obj.action,
      obj.description,
      obj.message,
      obj.value,
    ];
    
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    
    // Last resort: serialize but keep it readable
    try {
      const json = JSON.stringify(val);
      // If it's a simple key-value, extract values
      if (json.length < 200) return json;
      return '';
    } catch {
      return '';
    }
  }
  
  return String(val);
}

/**
 * Safely renders an array, ensuring each element is a string.
 */
export function safeStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(v => safeString(v)).filter(Boolean);
  if (typeof val === 'string') return [val];
  return [];
}
