# InstaScan Offline AI Implementation Guide

## Overview
This document outlines the implementation plan for adding offline AI capabilities to InstaScan, allowing farmers to identify crops, diseases, and pests without internet connectivity.

## Phase 2: Offline AI Implementation

### Architecture Options

#### Option 1: TensorFlow.js (Recommended)
**Pros:**
- Browser-native, no additional dependencies
- Supports WebGL acceleration
- Active community and extensive documentation
- Can convert existing models from TensorFlow/Keras

**Cons:**
- Model size can be large (5-50MB)
- Initial load time
- Limited accuracy compared to cloud AI

#### Option 2: ONNX Runtime Web
**Pros:**
- Wide model compatibility (PyTorch, TensorFlow, etc.)
- WebAssembly + WebGL support
- Good performance

**Cons:**
- Slightly larger bundle size
- More complex setup

### Implementation Steps

#### Step 1: Model Selection/Training

**Option A: Use Pre-trained Model**
```bash
# Download PlantVillage or similar agricultural dataset
# Fine-tune MobileNetV2 or EfficientNet-Lite for mobile deployment

# Example using TensorFlow/Keras
python train_model.py \
  --dataset plantvillage \
  --model mobilenet_v2 \
  --image-size 224 \
  --epochs 50 \
  --batch-size 32
```

**Option B: Train Custom Model**
```python
# train_agricultural_model.py
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout

# Load base model
base_model = MobileNetV2(
    input_shape=(224, 224, 3),
    include_top=False,
    weights='imagenet'
)
base_model.trainable = False

# Add custom classification head
model = tf.keras.Sequential([
    base_model,
    GlobalAveragePooling2D(),
    Dropout(0.2),
    Dense(512, activation='relu'),
    Dropout(0.3),
    Dense(num_classes, activation='softmax')  # num_classes = crops + diseases + pests
])

# Compile
model.compile(
    optimizer='adam',
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

# Train
model.fit(
    train_dataset,
    validation_data=val_dataset,
    epochs=50,
    callbacks=[...]
)

# Convert to TensorFlow.js format
!tensorflowjs_converter \
    --input_format=keras \
    ./model.h5 \
    ./tfjs_model/
```

#### Step 2: Model Conversion

```bash
# Convert saved model to TensorFlow.js
tensorflowjs_converter \
  --input_format=tf_saved_model \
  --output_format=tfjs_graph_model \
  --signature_name=serving_default \
  --saved_model_tags=serve \
  ./saved_model \
  ./public/models/crop-detector

# This will create:
# - model.json (model architecture)
# - group1-shard1of1.bin (model weights)
```

#### Step 3: Install Dependencies

```bash
npm install @tensorflow/tfjs @tensorflow/tfjs-backend-webgl
```

#### Step 4: Create Offline AI Service

```typescript
// src/services/offlineAI/cropDetector.ts
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

export interface OfflineDetectionResult {
  category: string;
  commonName: string;
  confidence: number;
  isOfflineResult: true;
  fallbackRecommended: boolean;
}

class CropDetectorService {
  private model: tf.GraphModel | null = null;
  private isModelLoaded = false;
  private labels: string[] = [];
  
  // Class mapping for your trained model
  private readonly CLASS_MAPPING = {
    0: { category: 'crop', name: 'Rice' },
    1: { category: 'crop', name: 'Wheat' },
    2: { category: 'disease', name: 'Rice Blast' },
    3: { category: 'disease', name: 'Wheat Rust' },
    4: { category: 'pest', name: 'Stem Borer' },
    // ... add all your classes
  };

  /**
   * Load the TensorFlow.js model
   */
  async loadModel(): Promise<boolean> {
    if (this.isModelLoaded) return true;

    try {
      console.log('🧠 Loading offline crop detection model...');
      
      // Set WebGL backend for performance
      await tf.setBackend('webgl');
      await tf.ready();
      
      // Load model from public directory
      this.model = await tf.loadGraphModel('/models/crop-detector/model.json');
      
      // Warm up the model with a dummy prediction
      const warmupTensor = tf.zeros([1, 224, 224, 3]);
      await this.model.predict(warmupTensor);
      warmupTensor.dispose();
      
      this.isModelLoaded = true;
      console.log('✅ Offline model loaded successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to load offline model:', error);
      this.isModelLoaded = false;
      return false;
    }
  }

  /**
   * Preprocess image for model input
   */
  private preprocessImage(imageElement: HTMLImageElement): tf.Tensor {
    return tf.tidy(() => {
      // Convert image to tensor
      let tensor = tf.browser.fromPixels(imageElement);
      
      // Resize to model input size (224x224)
      tensor = tf.image.resizeBilinear(tensor, [224, 224]);
      
      // Normalize to [0, 1] or [-1, 1] depending on your model
      tensor = tensor.div(255.0);
      
      // Add batch dimension
      tensor = tensor.expandDims(0);
      
      return tensor;
    });
  }

  /**
   * Run inference on an image
   */
  async detect(imageDataUrl: string): Promise<OfflineDetectionResult> {
    if (!this.isModelLoaded || !this.model) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = async () => {
        try {
          // Preprocess image
          const inputTensor = this.preprocessImage(img);
          
          // Run inference
          const predictions = this.model!.predict(inputTensor) as tf.Tensor;
          const predictionsData = await predictions.data();
          
          // Clean up tensors
          inputTensor.dispose();
          predictions.dispose();
          
          // Get top prediction
          const topIndex = Array.from(predictionsData).indexOf(Math.max(...predictionsData));
          const topConfidence = predictionsData[topIndex] * 100;
          
          const classInfo = this.CLASS_MAPPING[topIndex as keyof typeof this.CLASS_MAPPING];
          
          // Recommend cloud fallback if confidence is low
          const fallbackRecommended = topConfidence < 70;
          
          resolve({
            category: classInfo.category,
            commonName: classInfo.name,
            confidence: topConfidence,
            isOfflineResult: true,
            fallbackRecommended
          });
          
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageDataUrl;
    });
  }

  /**
   * Check if model is available
   */
  isAvailable(): boolean {
    return this.isModelLoaded;
  }

  /**
   * Unload model to free memory
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this.isModelLoaded = false;
    }
  }
}

// Singleton instance
export const cropDetector = new CropDetectorService();
```

#### Step 5: Update InstaScanFlow with Hybrid Detection

```typescript
// src/components/InstaScan/InstaScanFlow.tsx

import { cropDetector } from '@/services/offlineAI/cropDetector';

// Add state for offline mode
const [isOfflineMode, setIsOfflineMode] = useState(false);
const [offlineModelReady, setOfflineModelReady] = useState(false);

// Load offline model on mount
useEffect(() => {
  cropDetector.loadModel().then(loaded => {
    setOfflineModelReady(loaded);
    console.log('📱 Offline AI:', loaded ? 'Ready' : 'Not available');
  });
}, []);

// Modified handleImageCapture with hybrid approach
const handleImageCapture = async (imageFrames: string[]) => {
  setShowCamera(false);
  setIsAnalyzing(true);
  setErrorMessage(null);

  try {
    // Preprocess image
    const { selectBestFrame } = await import('@/utils/imagePreprocessing');
    const bestFrame = await selectBestFrame(imageFrames);
    const preprocessed = await preprocessImage(bestFrame);

    // Check connectivity
    const isOnline = navigator.onLine;
    
    // Try offline detection first if offline OR if user prefers it
    if ((!isOnline || isOfflineMode) && offlineModelReady) {
      console.log('🔌 Running offline AI detection...');
      
      const offlineResult = await cropDetector.detect(preprocessed.processedImage);
      
      // If confidence is good enough, use offline result
      if (offlineResult.confidence >= 60 && !offlineResult.fallbackRecommended) {
        // Transform to InstaScanResult format (simplified)
        const result: InstaScanResult = {
          imageUrl: bestFrame,
          detectedItem: {
            commonName: offlineResult.commonName,
            scientificName: '', // Offline model doesn't provide this
            confidence: offlineResult.confidence,
            category: offlineResult.category as any
          },
          healthStatus: {
            condition: 'warning',
            riskLevel: 'medium',
            primaryIssues: ['Analysis performed offline - limited detail'],
            secondaryIssues: []
          },
          diagnosis: {
            summary: t('instaScan.offlineDetectionSummary', { 
              item: offlineResult.commonName 
            }),
            details: t('instaScan.offlineDetectionDetails'),
            affectedParts: [],
            likelyDiseases: [],
            likelyPests: [],
            nutrientDeficiencies: []
          },
          recommendations: {
            immediate: [],
            shortTerm: [],
            longTerm: []
          },
          metadata: {
            confidenceScore: offlineResult.confidence,
            needsMoreImages: offlineResult.fallbackRecommended,
            suggestedNextSteps: [
              t('instaScan.connectForDetailedAnalysis')
            ],
            labTestRecommended: false,
            weatherSensitive: false
          },
          processingTimeMs: 500
        };
        
        setScanResult(result);
        
        sonnerToast.success(
          t('instaScan.offlineDetectionSuccess'), 
          { description: t('instaScan.connectForMore') }
        );
        
        return;
      }
      
      // If offline confidence is low, warn and try cloud
      if (isOnline) {
        sonnerToast.info(
          t('instaScan.lowOfflineConfidence'),
          { description: t('instaScan.tryingCloudAI') }
        );
      } else {
        // Offline and low confidence
        sonnerToast.warning(
          t('instaScan.offlineLowConfidence'),
          { description: t('instaScan.resultsLimited') }
        );
      }
    }
    
    // Cloud AI detection (original flow)
    if (!isOnline) {
      throw new Error(t('instaScan.offlineNoConnection'));
    }
    
    // ... rest of cloud AI flow
    
  } catch (error) {
    console.error('Error analyzing image:', error);
    // ... error handling
  }
};
```

#### Step 6: Add Offline Toggle in UI

```typescript
// In InstaScanFlow or Settings
<div className="flex items-center gap-2">
  <Switch
    checked={isOfflineMode}
    onCheckedChange={setIsOfflineMode}
    disabled={!offlineModelReady}
  />
  <label className="text-sm">
    {t('instaScan.useOfflineAI')}
    {offlineModelReady ? (
      <Badge variant="outline" className="ml-2 text-xs">Ready</Badge>
    ) : (
      <Badge variant="outline" className="ml-2 text-xs">Loading...</Badge>
    )}
  </label>
</div>
```

#### Step 7: Add Translation Keys

```json
// en/instascan.json
{
  "offlineDetectionSummary": "Detected {{item}} using offline AI",
  "offlineDetectionDetails": "This is a basic offline detection. Connect to internet for detailed diagnosis.",
  "connectForDetailedAnalysis": "Connect to internet for full analysis with treatment recommendations",
  "offlineDetectionSuccess": "Offline detection complete",
  "connectForMore": "Go online for detailed diagnosis and treatment",
  "lowOfflineConfidence": "Offline detection uncertain",
  "tryingCloudAI": "Connecting to cloud AI for better analysis",
  "offlineLowConfidence": "Limited offline detection",
  "resultsLimited": "Results may be less accurate. Please connect to internet.",
  "offlineNoConnection": "No internet connection and offline detection failed",
  "useOfflineAI": "Use offline AI when available"
}
```

### Model Training Dataset Requirements

**Minimum Requirements:**
- **Images per class**: 500-1000
- **Image variety**: Different lighting, angles, backgrounds, growth stages
- **Classes to train**:
  - Major crops (20-30 types)
  - Common diseases (50+ types)
  - Common pests (30+ types)
  - Nutrient deficiencies (10+ types)

**Recommended Datasets:**
- PlantVillage Dataset
- PlantDoc Dataset
- Custom dataset from field images

### Performance Optimization

```typescript
// Lazy load TensorFlow.js only when needed
const loadTensorFlow = async () => {
  const tf = await import('@tensorflow/tfjs');
  await import('@tensorflow/tfjs-backend-webgl');
  return tf;
};

// Cache model in IndexedDB
import { openDB } from 'idb';

async function cacheModel(modelUrl: string) {
  const db = await openDB('tfjs-models', 1, {
    upgrade(db) {
      db.createObjectStore('models');
    }
  });
  
  const response = await fetch(modelUrl);
  const modelData = await response.arrayBuffer();
  await db.put('models', modelData, 'crop-detector');
}
```

### Storage Considerations

**Model sizes:**
- MobileNetV2 (lightweight): ~9 MB
- EfficientNet-Lite0: ~15 MB
- Custom smaller models: 5-8 MB

**PWA Caching:**
```javascript
// sw-custom.ts
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('instascan-models-v1').then((cache) => {
      return cache.addAll([
        '/models/crop-detector/model.json',
        '/models/crop-detector/group1-shard1of1.bin'
      ]);
    })
  );
});
```

### Testing Checklist

- [ ] Model loads successfully in browser
- [ ] Inference runs in <2s on mobile
- [ ] Fallback to cloud AI works when confidence is low
- [ ] Works offline with cached model
- [ ] Memory usage stays under 100MB
- [ ] Model accuracy >70% on test set
- [ ] UI shows offline/online status clearly
- [ ] Translation works for all languages

### Future Enhancements

1. **Model Updates**: Periodically download updated models
2. **Federated Learning**: Learn from user feedback without uploading images
3. **Multi-model Ensemble**: Use multiple specialized models
4. **Edge TPU Support**: Hardware acceleration on supported devices
5. **Progressive Model Loading**: Load base model first, then specialized modules

## Estimated Timeline

- Model training/selection: 2-3 weeks
- Conversion & integration: 1 week
- Testing & optimization: 1-2 weeks
- **Total**: 4-6 weeks

## Resources

- [TensorFlow.js Documentation](https://www.tensorflow.org/js)
- [PlantVillage Dataset](https://www.tensorflow.org/datasets/catalog/plant_village)
- [MobileNet Models](https://github.com/tensorflow/models/tree/master/research/slim/nets/mobilenet)
- [TensorFlow.js Converter](https://github.com/tensorflow/tfjs/tree/master/tfjs-converter)
