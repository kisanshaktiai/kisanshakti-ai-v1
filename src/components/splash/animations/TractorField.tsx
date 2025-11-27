import { motion } from 'framer-motion';

export const TractorField = () => {
  return (
    <div className="relative w-48 h-48 mx-auto overflow-hidden">
      {/* Sky Background */}
      <motion.div 
        className="absolute inset-0 rounded-2xl"
        style={{ background: 'linear-gradient(180deg, hsl(210 100% 70%), hsl(200 85% 85%))' }}
      />
      
      {/* Sun */}
      <motion.div
        className="absolute w-12 h-12 rounded-full"
        style={{ 
          right: '20px',
          top: '20px',
          background: 'radial-gradient(circle, hsl(45 95% 65%), hsl(38 95% 58%))'
        }}
        animate={{ 
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      />
      
      {/* Field Base */}
      <motion.div 
        className="absolute bottom-0 w-full h-28 rounded-t-3xl"
        style={{ background: 'linear-gradient(180deg, hsl(30 45% 45%), hsl(25 50% 35%))' }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
      
      {/* Plowed Lines */}
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-0.5 rounded-full"
          style={{
            bottom: `${60 + i * 8}px`,
            left: 0,
            background: 'hsl(25 50% 30%)',
            width: '192px'
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ 
            delay: 0.5 + i * 0.15,
            duration: 1.5,
            ease: "easeInOut"
          }}
        />
      ))}
      
      {/* Tractor Body - Moving */}
      <motion.div
        className="absolute"
        style={{ bottom: '88px' }}
        initial={{ x: -60 }}
        animate={{ x: 180 }}
        transition={{ 
          duration: 3,
          ease: "linear",
          repeat: Infinity,
          repeatDelay: 0.5
        }}
      >
        {/* Tractor Cabin */}
        <div 
          className="relative w-10 h-8 rounded-lg"
          style={{ background: 'hsl(0 85% 55%)' }}
        >
          {/* Window */}
          <div 
            className="absolute w-5 h-4 rounded"
            style={{ 
              top: '4px',
              left: '3px',
              background: 'hsl(210 100% 85%)'
            }}
          />
          
          {/* Roof */}
          <div 
            className="absolute w-10 h-2 rounded-t-lg"
            style={{ 
              top: '-6px',
              background: 'hsl(0 85% 45%)'
            }}
          />
        </div>
        
        {/* Front Wheel */}
        <motion.div
          className="absolute rounded-full border-2"
          style={{
            width: '14px',
            height: '14px',
            bottom: '-14px',
            right: '2px',
            background: 'hsl(220 15% 20%)',
            borderColor: 'hsl(220 15% 15%)'
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
        
        {/* Back Wheel (Larger) */}
        <motion.div
          className="absolute rounded-full border-2"
          style={{
            width: '18px',
            height: '18px',
            bottom: '-16px',
            left: '-6px',
            background: 'hsl(220 15% 20%)',
            borderColor: 'hsl(220 15% 15%)'
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
        
        {/* Exhaust Pipe */}
        <div 
          className="absolute w-1 h-6 rounded-full"
          style={{ 
            background: 'hsl(220 15% 30%)',
            top: '-12px',
            right: '8px'
          }}
        />
        
        {/* Exhaust Smoke */}
        <motion.div
          className="absolute w-3 h-3 rounded-full"
          style={{ 
            background: 'hsl(220 10% 70% / 0.5)',
            top: '-18px',
            right: '6px'
          }}
          animate={{ 
            y: [-5, -20],
            scale: [0.8, 1.5],
            opacity: [0.6, 0]
          }}
          transition={{ 
            duration: 1,
            repeat: Infinity,
            repeatDelay: 0.3
          }}
        />
      </motion.div>
      
      {/* Dust Clouds */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: '20px',
            height: '8px',
            bottom: '80px',
            background: 'hsl(30 30% 60% / 0.4)'
          }}
          initial={{ x: -30, opacity: 0 }}
          animate={{ 
            x: [0, 100, 200],
            opacity: [0, 0.4, 0],
            scale: [0.8, 1, 1.2]
          }}
          transition={{ 
            delay: i * 0.3,
            duration: 2,
            repeat: Infinity,
            repeatDelay: 0.5
          }}
        />
      ))}
    </div>
  );
};
