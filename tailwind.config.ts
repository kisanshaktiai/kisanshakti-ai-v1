import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          glow: "hsl(var(--primary-glow, var(--primary)))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        nav: {
          DEFAULT: "hsl(var(--nav-background))",
          border: "hsl(var(--nav-border))",
          active: "hsl(var(--nav-active))",
          inactive: "hsl(var(--nav-inactive))",
        },
        // Semantic colors for agriculture
        'crop-stage': {
          germination: "hsl(var(--crop-stage-germination))",
          vegetative: "hsl(var(--crop-stage-vegetative))",
          flowering: "hsl(var(--crop-stage-flowering))",
          fruiting: "hsl(var(--crop-stage-fruiting))",
          harvesting: "hsl(var(--crop-stage-harvesting))",
        },
        'land-health': {
          excellent: "hsl(var(--land-health-excellent))",
          good: "hsl(var(--land-health-good))",
          poor: "hsl(var(--land-health-poor))",
        },
        'weather': {
          sunny: "hsl(var(--weather-sunny))",
          cloudy: "hsl(var(--weather-cloudy))",
          rainy: "hsl(var(--weather-rainy))",
          stormy: "hsl(var(--weather-stormy))",
          night: "hsl(var(--weather-night))",
        },
        'uv': {
          low: "hsl(var(--uv-low))",
          moderate: "hsl(var(--uv-moderate))",
          high: "hsl(var(--uv-high))",
          'very-high': "hsl(var(--uv-very-high))",
          extreme: "hsl(var(--uv-extreme))",
        },
        'overlay': {
          light: "hsl(var(--overlay-light))",
          dark: "hsl(var(--overlay-dark))",
        },
        // Chat section colors for AI interface
        'chat-section': {
          'green-bg': "hsl(var(--chat-section-green-bg))",
          'green-border': "hsl(var(--chat-section-green-border))",
          'green-icon': "hsl(var(--chat-section-green-icon))",
          'green-badge': "hsl(var(--chat-section-green-badge))",
          'yellow-bg': "hsl(var(--chat-section-yellow-bg))",
          'yellow-border': "hsl(var(--chat-section-yellow-border))",
          'yellow-icon': "hsl(var(--chat-section-yellow-icon))",
          'yellow-badge': "hsl(var(--chat-section-yellow-badge))",
          'purple-bg': "hsl(var(--chat-section-purple-bg))",
          'purple-border': "hsl(var(--chat-section-purple-border))",
          'purple-icon': "hsl(var(--chat-section-purple-icon))",
          'purple-badge': "hsl(var(--chat-section-purple-badge))",
          'blue-bg': "hsl(var(--chat-section-blue-bg))",
          'blue-border': "hsl(var(--chat-section-blue-border))",
          'blue-icon': "hsl(var(--chat-section-blue-icon))",
          'blue-badge': "hsl(var(--chat-section-blue-badge))",
          'red-bg': "hsl(var(--chat-section-red-bg))",
          'red-border': "hsl(var(--chat-section-red-border))",
          'red-icon': "hsl(var(--chat-section-red-icon))",
          'red-badge': "hsl(var(--chat-section-red-badge))",
          'default-bg': "hsl(var(--chat-section-default-bg))",
          'default-border': "hsl(var(--chat-section-default-border))",
          'default-icon': "hsl(var(--chat-section-default-icon))",
          'default-badge': "hsl(var(--chat-section-default-badge))",
        },
        'chat-bubble': {
          'user-bg': "var(--chat-bubble-user-bg)",
          'user-gradient': "var(--chat-bubble-user-gradient)",
          'ai-bg': "hsl(var(--chat-bubble-ai-bg))",
          'ai-border': "hsl(var(--chat-bubble-ai-border))",
          'ai-glass': "var(--chat-bubble-ai-glass)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        devanagari: ["Noto Sans Devanagari", "sans-serif"],
      },
      backgroundImage: {
        "gradient-primary": "var(--gradient-primary)",
        "gradient-neural": "var(--gradient-neural)",
        "gradient-earth": "var(--gradient-earth)",
        "gradient-sunrise": "var(--gradient-sunrise)",
        "gradient-success": "var(--gradient-success)",
        "gradient-warning": "var(--gradient-warning)",
        "gradient-danger": "var(--gradient-danger)",
        "gradient-cyber": "var(--gradient-cyber)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
        neural: "var(--shadow-neural)",
        ai: "var(--shadow-ai)",
        'chat-user': "var(--shadow-chat-user)",
        'chat-ai': "var(--shadow-chat-ai)",
      },
      height: {
        nav: "var(--nav-height)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "shimmer": "shimmer 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
