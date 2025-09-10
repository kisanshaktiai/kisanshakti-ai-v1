export const cropCategories = {
  kharif: [
    { value: 'rice', label: 'Rice (धान)' },
    { value: 'cotton', label: 'Cotton (कपास)' },
    { value: 'sugarcane', label: 'Sugarcane (गन्ना)' },
    { value: 'maize', label: 'Maize (मक्का)' },
    { value: 'soybean', label: 'Soybean (सोयाबीन)' },
    { value: 'groundnut', label: 'Groundnut (मूंगफली)' },
    { value: 'jowar', label: 'Jowar (ज्वार)' },
    { value: 'bajra', label: 'Bajra (बाजरा)' },
    { value: 'tur', label: 'Tur/Arhar (तूर)' },
  ],
  rabi: [
    { value: 'wheat', label: 'Wheat (गेहूं)' },
    { value: 'mustard', label: 'Mustard (सरसों)' },
    { value: 'gram', label: 'Gram (चना)' },
    { value: 'peas', label: 'Peas (मटर)' },
    { value: 'barley', label: 'Barley (जौ)' },
    { value: 'linseed', label: 'Linseed (अलसी)' },
    { value: 'masoor', label: 'Masoor (मसूर)' },
  ],
  vegetables: [
    { value: 'tomato', label: 'Tomato (टमाटर)' },
    { value: 'onion', label: 'Onion (प्याज)' },
    { value: 'potato', label: 'Potato (आलू)' },
    { value: 'chili', label: 'Chili (मिर्च)' },
    { value: 'brinjal', label: 'Brinjal (बैंगन)' },
    { value: 'okra', label: 'Okra (भिंडी)' },
    { value: 'cabbage', label: 'Cabbage (पत्तागोभी)' },
    { value: 'cauliflower', label: 'Cauliflower (फूलगोभी)' },
    { value: 'carrot', label: 'Carrot (गाजर)' },
    { value: 'radish', label: 'Radish (मूली)' },
    { value: 'spinach', label: 'Spinach (पालक)' },
    { value: 'bottle_gourd', label: 'Bottle Gourd (लौकी)' },
    { value: 'bitter_gourd', label: 'Bitter Gourd (करेला)' },
    { value: 'cucumber', label: 'Cucumber (खीरा)' },
  ],
  fruits: [
    { value: 'mango', label: 'Mango (आम)' },
    { value: 'banana', label: 'Banana (केला)' },
    { value: 'papaya', label: 'Papaya (पपीता)' },
    { value: 'guava', label: 'Guava (अमरूद)' },
    { value: 'pomegranate', label: 'Pomegranate (अनार)' },
    { value: 'grapes', label: 'Grapes (अंगूर)' },
    { value: 'orange', label: 'Orange (संतरा)' },
    { value: 'lemon', label: 'Lemon (नींबू)' },
    { value: 'watermelon', label: 'Watermelon (तरबूज)' },
    { value: 'muskmelon', label: 'Muskmelon (खरबूजा)' },
  ],
  cashCrops: [
    { value: 'coffee', label: 'Coffee (कॉफी)' },
    { value: 'tea', label: 'Tea (चाय)' },
    { value: 'rubber', label: 'Rubber (रबर)' },
    { value: 'coconut', label: 'Coconut (नारियल)' },
    { value: 'arecanut', label: 'Arecanut (सुपारी)' },
    { value: 'cashew', label: 'Cashew (काजू)' },
    { value: 'spices', label: 'Spices (मसाले)' },
  ]
};

export const allCrops = [
  ...cropCategories.kharif,
  ...cropCategories.rabi,
  ...cropCategories.vegetables,
  ...cropCategories.fruits,
  ...cropCategories.cashCrops,
];

export const cropStages = [
  { value: 'land_preparation', label: 'Land Preparation' },
  { value: 'sowing', label: 'Sowing/Planting' },
  { value: 'germination', label: 'Germination' },
  { value: 'vegetative', label: 'Vegetative Growth' },
  { value: 'flowering', label: 'Flowering' },
  { value: 'fruiting', label: 'Fruiting/Grain Filling' },
  { value: 'maturity', label: 'Maturity' },
  { value: 'harvesting', label: 'Harvesting' },
  { value: 'post_harvest', label: 'Post Harvest' },
];

export const irrigationTypes = [
  { value: 'drip', label: 'Drip Irrigation' },
  { value: 'sprinkler', label: 'Sprinkler Irrigation' },
  { value: 'flood', label: 'Flood Irrigation' },
  { value: 'furrow', label: 'Furrow Irrigation' },
  { value: 'rainfed', label: 'Rainfed' },
  { value: 'canal', label: 'Canal Irrigation' },
  { value: 'tubewell', label: 'Tubewell' },
  { value: 'mixed', label: 'Mixed Methods' },
];

export const soilTypes = [
  { value: 'black_cotton', label: 'Black Cotton Soil' },
  { value: 'red', label: 'Red Soil' },
  { value: 'alluvial', label: 'Alluvial Soil' },
  { value: 'laterite', label: 'Laterite Soil' },
  { value: 'clay', label: 'Clay Soil' },
  { value: 'sandy', label: 'Sandy Soil' },
  { value: 'loamy', label: 'Loamy Soil' },
  { value: 'saline', label: 'Saline Soil' },
  { value: 'peaty', label: 'Peaty Soil' },
];

export const soilHealthStatus = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'average', label: 'Average' },
  { value: 'poor', label: 'Poor' },
  { value: 'needs_attention', label: 'Needs Attention' },
];

export const waterSources = [
  { value: 'well', label: 'Well' },
  { value: 'borewell', label: 'Borewell' },
  { value: 'canal', label: 'Canal' },
  { value: 'river', label: 'River' },
  { value: 'pond', label: 'Pond' },
  { value: 'dam', label: 'Dam' },
  { value: 'rainwater', label: 'Rainwater Harvesting' },
  { value: 'municipal', label: 'Municipal Supply' },
];