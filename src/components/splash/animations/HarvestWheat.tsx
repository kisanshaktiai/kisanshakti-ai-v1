import { motion } from 'framer-motion';

export const HarvestWheat = () => {
  return (
    <div className="relative w-48 h-48 mx-auto overflow-hidden rounded-2xl">
      {/* Golden Sky */}
      <div 
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, hsl(45 90% 75%), hsl(38 85% 80%))' }}
      />
      
      {/* Sun */}
      <motion.div
        className="absolute w-16 h-16 rounded-full"
        style={{ 
          right: '20px',
          top: '15px',
          background: 'radial-gradient(circle, hsl(45 100% 65%), hsl(38 95% 55%))'
        }}
        animate={{ 
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 2.5, repeat: Infinity }}
      >
        {/* Sun glow */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{ 
            background: 'radial-gradient(circle, hsl(45 100% 70% / 0.4), transparent 70%)',
            filter: 'blur(8px)',
            transform: 'scale(1.5)'
          }}
        />
      </motion.div>
      
      {/* Ground */}
      <div 
        className="absolute bottom-0 w-full h-16 rounded-t-2xl"
        style={{ background: 'linear-gradient(180deg, hsl(35 50% 45%), hsl(30 55% 35%))' }}
      />
      
      {/* Wheat Field - Multiple stalks */}
      {[...Array(9)].map((_, i) => {
        const delay = i * 0.1;
        const swayDuration = 2 + (i % 3) * 0.3;
        return (
          <motion.div
            key={i}
            className="absolute origin-bottom"
            style={{ 
              bottom: '64px',
              left: `${15 + i * 18}px`,
              width: '8px'
            }}
            animate={{ 
              rotate: [-2, 2, -2]
            }}
            transition={{ 
              delay,
              duration: swayDuration,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            {/* Wheat stalk */}
            <div 
              className="w-1 h-24 mx-auto rounded-full"
              style={{ background: 'linear-gradient(180deg, hsl(45 80% 50%), hsl(40 75% 45%))' }}
            />
            
            {/* Wheat head (grain) */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              {[...Array(5)].map((_, j) => (
                <motion.div
                  key={j}
                  className="absolute rounded-full"
                  style={{
                    width: '6px',
                    height: '3px',
                    background: 'hsl(45 90% 55%)',
                    left: j % 2 === 0 ? '-2px' : '2px',
                    top: `${j * 3}px`,
                    transform: `rotate(${j % 2 === 0 ? -15 : 15}deg)`
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: delay + 0.5 + j * 0.05, duration: 0.3 }}
                />
              ))}
            </div>
            
            {/* Small leaves */}
            <motion.div
              className="absolute w-4 h-1 rounded-full"
              style={{ 
                top: '40px',
                left: '-6px',
                background: 'hsl(100 60% 45%)',
                clipPath: 'ellipse(50% 50% at 0% 50%)'
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: delay + 0.3, duration: 0.4 }}
            />
          </motion.div>
        );
      })}
      
      {/* Sickle/Harvesting Tool */}
      <motion.div
        className="absolute"
        style={{ 
          right: '35px',
          bottom: '90px'
        }}
        initial={{ x: 60, y: -20, rotate: -45, opacity: 0 }}
        animate={{ 
          x: [60, 0, 5, 0],
          y: [-20, 0, -3, 0],
          rotate: [-45, -25, -30, -25],
          opacity: [0, 1, 1, 1]
        }}
        transition={{ 
          delay: 1,
          duration: 1.5,
          times: [0, 0.5, 0.75, 1],
          ease: "easeOut"
        }}
      >
        {/* Handle */}
        <div 
          className="w-1 h-12 rounded-full origin-bottom"
          style={{ 
            background: 'hsl(30 40% 35%)',
            transform: 'rotate(20deg)'
          }}
        />
        
        {/* Blade */}
        <div 
          className="absolute bottom-0 left-0 w-8 h-6 rounded-bl-full rounded-br-full border-2"
          style={{ 
            background: 'linear-gradient(135deg, hsl(0 0% 75%), hsl(0 0% 85%))',
            borderColor: 'hsl(0 0% 60%)',
            transformOrigin: 'top right',
            transform: 'rotate(-100deg) translateX(-2px)'
          }}
        />
      </motion.div>
      
      {/* Falling wheat grains */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-3 rounded-full"
          style={{
            right: `${40 + (i % 3) * 8}px`,
            background: 'hsl(45 90% 55%)'
          }}
          initial={{ 
            y: -10,
            x: 0,
            rotate: 0,
            opacity: 0
          }}
          animate={{ 
            y: [0, 80],
            x: [(i % 2) * 5, (i % 2) * 10],
            rotate: [0, (i % 2) * 180],
            opacity: [0, 1, 1, 0]
          }}
          transition={{ 
            delay: 1.5 + i * 0.15,
            duration: 1.2,
            ease: "easeIn",
            repeat: Infinity,
            repeatDelay: 1.5
          }}
        />
      ))}
      
      {/* Harvested pile at bottom */}
      <motion.div
        className="absolute rounded-t-full"
        style={{
          bottom: '64px',
          right: '30px',
          width: '32px',
          height: '20px',
          background: 'hsl(45 85% 50%)'
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ 
          scale: [0, 1.1, 1],
          opacity: 1
        }}
        transition={{ 
          delay: 2,
          duration: 0.8
        }}
      >
        {/* Grain texture */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: 'hsl(40 90% 45%)',
              left: `${5 + (i % 3) * 8}px`,
              top: `${2 + Math.floor(i / 3) * 6}px`
            }}
          />
        ))}
      </motion.div>
      
      {/* Sparkle effects (golden glow) */}
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2"
          style={{
            left: `${30 + i * 35}%`,
            top: `${40 + i * 10}%`,
          }}
        >
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'hsl(45 100% 70%)' }}
            animate={{ 
              scale: [0, 1, 0],
              opacity: [0, 0.8, 0],
              rotate: [0, 180]
            }}
            transition={{
              delay: 1 + i * 0.3,
              duration: 1.5,
              repeat: Infinity,
              repeatDelay: 2
            }}
          />
          {/* Cross sparkle lines */}
          <motion.div
            className="absolute w-3 h-0.5 bg-warning/70 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            animate={{ 
              scaleX: [0, 1, 0],
              opacity: [0, 1, 0]
            }}
            transition={{
              delay: 1 + i * 0.3,
              duration: 1.5,
              repeat: Infinity,
              repeatDelay: 2
            }}
          />
          <motion.div
            className="absolute w-0.5 h-3 bg-warning/70 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            animate={{ 
              scaleY: [0, 1, 0],
              opacity: [0, 1, 0]
            }}
            transition={{
              delay: 1 + i * 0.3,
              duration: 1.5,
              repeat: Infinity,
              repeatDelay: 2
            }}
          />
        </motion.div>
      ))}
    </div>
  );
};
