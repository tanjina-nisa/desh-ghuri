// Dhaka city data: start points + famous places (coordinates approximate)
window.DHAKA_STARTS = [
  { id: 'shahbag', n: 'Shahbag Mor', bn: 'শাহবাগ মোড়', c: [90.3958, 23.7383] },
  { id: 'farmgate', n: 'Farmgate', bn: 'ফার্মগেট', c: [90.3897, 23.7577] },
  { id: 'kawran', n: 'Kawran Bazar', bn: 'কারওয়ান বাজার', c: [90.3930, 23.7509] },
  { id: 'bijoy', n: 'Bijoy Sarani', bn: 'বিজয় সরণি', c: [90.3880, 23.7663] },
  { id: 'gulshan1', n: 'Gulshan-1 Circle', bn: 'গুলশান-১', c: [90.4166, 23.7806] },
  { id: 'banani', n: 'Banani', bn: 'বনানী', c: [90.4043, 23.7937] },
  { id: 'mohakhali', n: 'Mohakhali', bn: 'মহাখালী', c: [90.4005, 23.7781] },
  { id: 'dhanmondi', n: 'Dhanmondi 27', bn: 'ধানমন্ডি ২৭', c: [90.3756, 23.7562] },
  { id: 'mirpur10', n: 'Mirpur-10', bn: 'মিরপুর-১০', c: [90.3687, 23.8069] },
  { id: 'uttara', n: 'Uttara (Jasimuddin)', bn: 'উত্তরা', c: [90.4002, 23.8613] },
  { id: 'kuril', n: 'Kuril Bishwa Road', bn: 'কুড়িল বিশ্বরোড', c: [90.4210, 23.8199] },
  { id: 'motijheel', n: 'Motijheel Shapla Chattar', bn: 'মতিঝিল', c: [90.4180, 23.7275] },
  { id: 'jatrabari', n: 'Jatrabari', bn: 'যাত্রাবাড়ী', c: [90.4349, 23.7104] },
  { id: 'hatirjheel', n: 'Hatirjheel', bn: 'হাতিরঝিল', c: [90.4060, 23.7570] }
];

// [id, emoji, name, bn, [lng,lat], short info]
window.DHAKA_PLACES = [
  ['lalbagh', '🏰', 'Lalbagh Fort', 'লালবাগ কেল্লা', [90.3882, 23.7190], '17th century-r Mughal durgo. Pori Bibi-r mazar, Diwan-i-Aam ar shundor bagan. Old Dhakar shobcheye famous jayga.'],
  ['ahsan', '🕌', 'Ahsan Manzil', 'আহসান মঞ্জিল', [90.4060, 23.7086], 'Buriganga-r tire golapi "Pink Palace". Dhakar Nawab-der bari, ekhon jadughor.'],
  ['shaheedminar', '🌹', 'Central Shaheed Minar', 'কেন্দ্রীয় শহীদ মিনার', [90.3966, 23.7270], '1952-r Bhasha Andoloner shohid-der smrite. 21 February-te lakh lakh manush ful dite ashe.'],
  ['sangsad', '🏛️', 'Jatiya Sangsad Bhaban', 'জাতীয় সংসদ ভবন', [90.3786, 23.7626], 'Louis Kahn-er design kora Parliament bhobon — prithibir onnotomo shera sthapotto. Shamne Chandrima Udyan.'],
  ['museum', '🖼️', 'Bangladesh National Museum', 'জাতীয় জাদুঘর', [90.3946, 23.7375], 'Shahbag-e deshe shobcheye boro jadughor — itihash, shilpo, prakritik itihash shob ek jaygay.'],
  ['hatirjheel', '🌉', 'Hatirjheel', 'হাতিরঝিল', [90.4060, 23.7570], 'Lake, bridge ar raater rongin light-show. Dhakar shobcheye shundor drive & adda spot.'],
  ['dhakeshwari', '🛕', 'Dhakeshwari Temple', 'ঢাকেশ্বরী মন্দির', [90.3862, 23.7232], 'Dhakar jatiyo mondir — dharona kora hoy "Dhaka" naam eshechhe Dhakeshwari theke.'],
  ['tara', '⭐', 'Star Mosque (Tara Masjid)', 'তারা মসজিদ', [90.4004, 23.7155], 'Armanitola-y chini-matir tukra diye tara-r nokshay shajano shundor mosjid.'],
  ['liberation', '🇧🇩', 'Liberation War Museum', 'মুক্তিযুদ্ধ জাদুঘর', [90.3772, 23.7795], 'Agargaon-e 1971-er Muktijuddher itihash, chobi ar smritichinho.'],
  ['baitul', '🕌', 'Baitul Mukarram', 'বায়তুল মোকাররম', [90.4128, 23.7290], 'Jatiyo Mosjid — Kaaba-r adole design kora, Paltan-e.'],
  ['sadarghat', '🚢', 'Sadarghat', 'সদরঘাট', [90.4113, 23.7058], 'Buriganga nodir boro launch terminal — shob shomoy hoi-choi, nouka ar launch.'],
  ['curzon', '🎓', 'Curzon Hall', 'কার্জন হল', [90.4003, 23.7270], 'Dhaka University-r lal-ita bhobon, 1904 sale toiri — Mughal ar European style mishano.'],
  ['ramna', '🌳', 'Ramna Park', 'রমনা পার্ক', [90.4010, 23.7380], 'Shohorer majhe shobuj park, lake ar Pohela Boishakh-er Chhayanaut onushthan.'],
  ['suhrawardy', '🕊️', 'Suhrawardy Udyan', 'সোহরাওয়ার্দী উদ্যান', [90.3980, 23.7330], '7 March 1971-er bhashon ar 16 December-er atmasamarpan ei maathe — Shikha Chirantan ache.'],
  ['dhanmondilake', '🚣', 'Dhanmondi Lake', 'ধানমন্ডি লেক', [90.3770, 23.7465], 'Lake-er pashe hatar rasta, Rabindra Sarobar-e gaan-adda.'],
  ['botanical', '🌺', 'National Botanical Garden', 'জাতীয় উদ্ভিদ উদ্যান', [90.3460, 23.8170], 'Mirpur-e 200+ acre jure hajar rokom gach-gachhali.'],
  ['zoo', '🐅', 'Bangladesh National Zoo', 'জাতীয় চিড়িয়াখানা', [90.3490, 23.8126], 'Royal Bengal Tiger, hati, jiraf — Mirpur-e.'],
  ['stadium', '🏏', 'Sher-e-Bangla Stadium', 'শেরেবাংলা স্টেডিয়াম', [90.3634, 23.8069], 'Mirpur-e Bangladesh cricket-er home ground.'],
  ['jfp', '🛍️', 'Jamuna Future Park', 'যমুনা ফিউচার পার্ক', [90.4240, 23.8135], 'Deshe shobcheye boro shopping mall — cinema, food court, game zone.'],
  ['bashundhara', '🏬', 'Bashundhara City', 'বসুন্ধরা সিটি', [90.3907, 23.7509], 'Panthapath-e boro shopping complex.'],
  ['gulshanlake', '🌿', 'Gulshan Lake Park', 'গুলশান লেক পার্ক', [90.4150, 23.7960], 'Gulshan-er shanto lake-er pashe park ar hatar rasta.'],
  ['airport', '✈️', 'Hazrat Shahjalal Airport', 'শাহজালাল বিমানবন্দর', [90.3978, 23.8433], 'Deshe shobcheye boro international airport.'],
  ['armenian', '⛪', 'Armenian Church', 'আর্মেনিয়ান চার্চ', [90.4060, 23.7160], '1781 sale toiri, Armanitola-r purono church.'],
  ['novo', '🔭', 'Novo Theatre', 'নভোথিয়েটার', [90.3888, 23.7653], 'Bijoy Sarani-te planetarium — akash-er tara dekhar jayga.']
];
