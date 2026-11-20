export const KILL_RATING=10, KILL_COINS=75, START_COINS=250, START_WEAPON=3;
export const MEDKIT_LIMIT=99;
export const START_MEDKITS=Object.freeze({small:2,large:1});
export const medkits=Object.freeze({
  small:Object.freeze({heal:30,duration:2.5}),
  large:Object.freeze({heal:65,duration:4})
});
export const ranks=[
  {name:'Новобранец',rating:0,bonus:0}, {name:'Боец',rating:50,bonus:200},
  {name:'Штурмовик',rating:150,bonus:350}, {name:'Ветеран',rating:300,bonus:500},
  {name:'Элита',rating:600,bonus:800}, {name:'Легенда',rating:1000,bonus:1200}
];
export const rankIndex=rating=>ranks.findLastIndex(rank=>rating>=rank.rating);
const armorTiers=[
  {id:'armor-light',equipment:'armorLight',name:'Лёгкий бронежилет',category:'equipment',label:'Броня',rating:20,price:350,armor:25,tag:'ЗАЩИТА',description:'Поглощает до 25 ед. урона. Запас восстанавливается при возрождении.'},
  {id:'armor-heavy',equipment:'armorHeavy',name:'Тяжёлый бронежилет',category:'equipment',label:'Броня',rating:100,price:900,armor:50,tag:'ЗАЩИТА',description:'Поглощает до 50 ед. урона. Запас восстанавливается при возрождении.'}
];
const helmetTiers=[
  {id:'helmet-light',equipment:'helmetLight',name:'Лёгкий шлем',category:'equipment',label:'Шлем',rating:30,price:300,helmet:15,description:'Поглощает до 15 ед. урона от попаданий в голову. Пополняется при возрождении.'},
  {id:'helmet-heavy',equipment:'helmetHeavy',name:'Тяжёлый шлем',category:'equipment',label:'Шлем',rating:120,price:650,helmet:30,description:'Поглощает до 30 ед. урона от попаданий в голову. Пополняется при возрождении.'}
];
const cosmeticKits=[
  {id:'skin-specter',skin:'specter',name:'Призрак',category:'cosmetic',label:'Фантастический облик',rating:50,price:450,description:'Тёмный костюм с полупрозрачным бирюзовым шлейфом в движении.'},
  {id:'skin-warden',skin:'warden',name:'Страж разлома',category:'cosmetic',label:'Фантастический облик',rating:150,price:900,description:'Пластинчатый доспех с мерцающими фиолетовыми кристаллами.'},
  {id:'skin-nova',skin:'nova',name:'Сверхновая',category:'cosmetic',label:'Фантастический облик',rating:300,price:1600,description:'Звёздный костюм с поднимающимися огненными искрами.'}
];
export const fantasyStyles=cosmeticKits.map(({skin,name,description})=>({id:skin,name,description,premium:true}));
export const catalog=[
  {id:'ar04',weapon:0,name:'AR-04',category:'assault',label:'Автомат',rating:50,price:450,tag:'УНИВЕРСАЛЬНЫЙ',description:'Точная очередь на средней дистанции.'},
  {id:'sg12',weapon:1,name:'SG-12',category:'special',label:'Дробовик',rating:100,price:650,tag:'БЛИЖНИЙ БОЙ',description:'Шесть дробин. Один убедительный аргумент.'},
  {id:'rx9',weapon:2,name:'RX-9',category:'special',label:'Рельсотрон',rating:300,price:1800,tag:'ТОЧНОСТЬ',description:'Мощный одиночный выстрел через всю арену.'},
  {id:'p9',weapon:3,name:'P-9',category:'pistol',label:'Пистолет',rating:0,price:0,tag:'СТАРТОВЫЙ',description:'Надёжный старт. Доступен каждому бойцу.'},
  {id:'ak47',weapon:4,name:'AK-47',category:'assault',label:'Автомат',rating:150,price:1000,tag:'ОГНЕВАЯ МОЩЬ',description:'Тяжёлая очередь с увеличенным уроном.'},
  {id:'mg60',weapon:5,name:'MG-60',category:'machinegun',label:'Пулемёт',rating:200,price:1250,tag:'ПОДАВЛЕНИЕ',description:'60 патронов для непрерывного давления.'},
  {id:'titan',weapon:6,name:'TITAN-100',category:'machinegun',label:'Тяжёлый пулемёт',rating:600,price:3000,tag:'АРСЕНАЛ ЭЛИТЫ',description:'Сотня патронов и максимальная плотность огня.'},
  {id:'deagle',weapon:7,name:'EAGLE .50',category:'pistol',label:'Тяжёлый пистолет',rating:100,price:550,tag:'КРУПНЫЙ КАЛИБР',description:'Высокий урон. Каждый выстрел имеет значение.'},
  {id:'br8',weapon:8,name:'BR-8 «Гром»',category:'launcher',label:'Базука',rating:220,price:1550,tag:'УРОН ПО ПЛОЩАДИ',description:'Ракета взрывается при попадании. Стены и настилы укрывают от взрыва.'},
  {id:'vx9',weapon:9,name:'VX-9 «Импульс»',category:'assault',label:'Энергокарабин',rating:125,price:800,tag:'СРЕДНЯЯ ДИСТАНЦИЯ',description:'Быстрые энергетические импульсы и точная автоматическая стрельба.'},
  {id:'sm11',weapon:10,name:'SM-11 «Вектор»',category:'assault',label:'Пистолет-пулемёт',rating:30,price:360,tag:'БЛИЖНИЙ БОЙ',description:'Компактный скорострельный ствол для коротких дистанций.'},
  {id:'frag5',name:'FRAG / 5',category:'grenade',label:'5 осколочных гранат',rating:20,price:150,amount:5,tag:'РАСХОДНИК',description:'Урон по площади. Запас расходуется при броске.'},
  {id:'medkit-small',name:'Малая аптечка',category:'medkit',label:'Лечение',rating:0,price:60,medkit:'small',amount:1,...medkits.small,description:'Восстанавливает до 30 здоровья за 2,5 секунды.'},
  {id:'medkit-large',name:'Большая аптечка',category:'medkit',label:'Лечение',rating:0,price:120,medkit:'large',amount:1,...medkits.large,description:'Восстанавливает до 65 здоровья за 4 секунды.'},
  {id:'jetpack',equipment:'jetpack',name:'JP-01',category:'equipment',label:'Джетпак',rating:100,price:1000,flightSeconds:3,tag:'ПОЛЁТ',description:'Удерживай пробел для полёта. Около 3 секунд тяги, восстановление топлива на земле.'},
  {id:'jetpack-long',equipment:'jetpackLong',name:'JP-02 LONG',category:'equipment',label:'Улучшенный джетпак',rating:250,price:2200,flightSeconds:10,tag:'ДОЛГИЙ ПОЛЁТ',description:'10 секунд непрерывной тяги. Автоматически заменяет JP-01. Топливо восстанавливается на земле.'},
  ...armorTiers,
  ...helmetTiers,
  ...cosmeticKits
];
export const rankUnlocks=rank=>catalog.filter(item=>item.rating===rank.rating&&(item.weapon!==undefined||item.skin));
export function rankUnlocksBetween(previousRating,currentRating){
  return ranks.filter(rank=>rank.rating>previousRating&&rank.rating<=currentRating).flatMap(rankUnlocks);
}
export const itemForWeapon=index=>catalog.find(item=>item.weapon===index);
export const itemForSkin=style=>cosmeticKits.find(item=>item.skin===style);
export const armorForEquipment=equipment=>armorTiers.findLast(item=>equipment?.[item.equipment]);
export const helmetForEquipment=equipment=>helmetTiers.findLast(item=>equipment?.[item.equipment]);
