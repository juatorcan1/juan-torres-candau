/* ---------- diet ----------
   Targets: Mifflin-St Jeor (hombre) × factor de actividad según los minutos entrenados
   en las últimas 4 semanas y el tipo de trabajo, ajustado por objetivo.
   Menus are written for 2.400 kcal; quantities in {braces} scale with the person's target. */
const GOALS = { perder: { l: "Perder grasa", adj: -450, prot: 2.0 }, mantener: { l: "Mantener", adj: 0, prot: 1.8 }, ganar: { l: "Ganar músculo", adj: 250, prot: 1.8 } };
const WORK = { oficina: { l: "Oficina", f: 0 }, mixto: { l: "Mixto (oficina y obra)", f: 0.07 }, obra: { l: "Obra / trabajo físico", f: 0.15 } };
const PROFILE_DEFAULT = { height: 178, age: 35, goal: "perder", work: "mixto", alcoholGoal: 7 };
const CIRCS = {
  bocadillo: { l: "Obra: bocadillo o tortitas", s: "Sin cocina: todo va en la mochila" },
  bar: { l: "Bar o restaurante", s: "Menú del día o de tapas" },
  oficina: { l: "Oficina con cocina", s: "Táper y microondas" }
};
const MEALS = [["desayuno", "Desayuno"], ["media", "Media mañana"], ["comida", "Comida"], ["merienda", "Merienda"], ["cena", "Cena"]];

function dietTargets(profile, weightKg, weeklyMin){
  const p = { ...PROFILE_DEFAULT, ...(profile || {}) };
  const kg = weightKg || 80;
  const bmr = 10 * kg + 6.25 * num(p.height) - 5 * num(p.age) + 5;
  const act = (weeklyMin < 90 ? 1.35 : weeklyMin < 180 ? 1.45 : weeklyMin < 300 ? 1.55 : 1.68) + (WORK[p.work] || WORK.mixto).f;
  const g = GOALS[p.goal] || GOALS.perder;
  const kcal = Math.round((bmr * act + g.adj) / 50) * 50;
  const prot = Math.round(g.prot * kg), fat = Math.round(0.9 * kg);
  const carbs = Math.max(80, Math.round((kcal - prot * 4 - fat * 9) / 4));
  return { kcal, prot, fat, carbs, bmr: Math.round(bmr), act, tdee: Math.round(bmr * act), goal: g.l };
}
const scaleText = (t, f) => t.replace(/\{(\d+)\}/g, (_, n) => String(Math.max(5, Math.round(+n * f / 5) * 5)));

// Index 0 = lunes … 6 = domingo.
const MENU = {
  desayuno: [
    ["Café con leche", "Tostada de pan integral ({80} g) con tomate, 1 cucharada de aceite de oliva y jamón serrano ({40} g)", "1 pieza de fruta"],
    ["Yogur griego natural ({200} g) con copos de avena ({50} g) y {20} g de nueces", "1 plátano", "Café o infusión"],
    ["Tortilla francesa de 2 huevos + 2 claras", "Pan integral ({60} g)", "1 kiwi y café"],
    ["Porridge: avena ({60} g) cocida con leche ({250} ml) y canela", "Queso fresco batido ({150} g) con frutos rojos"],
    ["4 tortitas de maíz con pavo ({60} g) y aguacate ({50} g)", "Café con leche"],
    ["Tostada integral ({80} g) con queso fresco ({80} g) y 1 huevo a la plancha", "1 naranja"],
    ["Tortitas caseras: 2 huevos + avena ({60} g) + 1 plátano", "Hilo de miel y café"]
  ],
  media: {
    bocadillo: [["1 plátano y {30} g de almendras"], ["Yogur proteico y 1 manzana"], ["2 tortitas de maíz con pavo ({40} g)"], ["Barrita de proteína (unos 20 g de proteína) y 1 fruta"], ["Bocadillo pequeño de pan integral ({40} g) con atún"], ["1 plátano y {30} g de anacardos"], ["Batido de proteína en botella y 1 fruta"]],
    bar: [["Café con leche y media tostada con tomate"], ["Café solo y 1 pieza de fruta que lleves"], ["Pincho pequeño de tortilla y café"], ["Café con leche y 1 fruta"], ["Media tostada con tomate y aceite, café"], ["Café y {30} g de frutos secos"], ["Café con leche"]],
    oficina: [["Yogur griego con {20} g de nueces"], ["Hummus ({50} g) con palitos de zanahoria"], ["Queso fresco ({100} g) y 1 fruta"], ["Kéfir ({200} ml) y 1 manzana"], ["1 plátano y {30} g de almendras"], ["Yogur proteico y frutos rojos"], ["1 fruta"]]
  },
  comida: {
    bocadillo: [
      ["Bocadillo de pan integral ({120} g) con pechuga de pollo a la plancha ({120} g), tomate y lechuga", "1 fruta y 1 yogur"],
      ["Bocadillo ({120} g) de atún al natural (2 latas), huevo cocido y pimiento asado con un chorrito de aceite", "1 fruta"],
      ["6 tortitas de maíz con hummus ({60} g), pavo ({100} g) y espinacas", "{20} g de frutos secos y 1 fruta"],
      ["Bocadillo ({120} g) de tortilla francesa de 2 huevos con jamón cocido ({60} g) y tomate", "1 fruta"],
      ["2 wraps integrales con pollo ({120} g), queso fresco, lechuga y salsa de yogur", "1 fruta"],
      ["Bocadillo ({120} g) de lomo a la plancha ({120} g) con pimientos", "Táper frío de tomate y pepino", "1 fruta"],
      ["Táper frío de garbanzos cocidos ({200} g) con atún, huevo, tomate y cebolla", "Pan ({60} g)"]
    ],
    bar: [
      ["Primero: ensalada mixta", "Segundo: pechuga a la plancha con patata cocida o arroz blanco", "Postre: fruta · Bebida: agua o cerveza 0,0"],
      ["Primero: lentejas o garbanzos (media ración si llevan chorizo)", "Segundo: pescado a la plancha con ensalada", "Postre: café"],
      ["Primero: parrillada de verduras", "Segundo: entrecot o solomillo con ensalada, sin patatas fritas", "1 trozo de pan"],
      ["Plato combinado: lomo o pollo, 1 huevo a la plancha, ensalada y arroz blanco", "Pide cambiar las patatas fritas por ensalada"],
      ["Primero: crema de verduras o gazpacho sin picatostes", "Segundo: merluza o bacalao con verduras", "Postre: yogur o fruta"],
      ["De tapas: 1 pincho de tortilla, pulpo o sepia a la plancha y ensalada de tomate", "Evita rebozados y croquetas"],
      ["Arroz o paella: 1 plato normal, sin repetir", "Ensalada para acompañar", "Postre: fruta"]
    ],
    oficina: [
      ["Arroz integral ({80} g en crudo) con pollo al curry ({150} g) y verduras", "1 fruta"],
      ["Pasta integral ({80} g en crudo) con atún, tomate triturado y aceitunas", "Ensalada verde"],
      ["Lentejas estofadas con verduras ({80} g en crudo)", "1 huevo cocido y 1 fruta"],
      ["Salmón ({150} g) al microondas con patata cocida ({250} g) y brócoli"],
      ["Quinoa ({70} g en crudo) con garbanzos ({100} g cocidos), pavo ({100} g) y verduras asadas"],
      ["Pollo o pavo ({150} g) con boniato asado ({250} g) y judías verdes"],
      ["Garbanzos ({200} g cocidos) salteados con espinacas y 1 huevo", "Pan ({40} g)"]
    ]
  },
  merienda: [
    ["Yogur natural y 1 fruta"], ["Tostada integral ({40} g) con pavo"], ["Batido de proteína con leche o agua"], ["Queso fresco ({100} g) y {15} g de nueces"],
    ["2 tortitas de maíz con crema de cacahuete ({15} g)"], ["1 fruta y {20} g de frutos secos"], ["Kéfir ({200} ml) con avena ({30} g)"]
  ],
  cena: [
    ["Tortilla de 2 huevos con espinacas", "Ensalada grande con aceite de oliva", "Pan integral ({40} g)"],
    ["Merluza a la plancha ({180} g)", "Verduras salteadas y patata cocida ({150} g)"],
    ["Pechuga de pollo ({150} g) a la plancha", "Ensalada de tomate y aguacate ({50} g)", "Pan ({40} g)"],
    ["Crema de verduras", "Revuelto de 2 huevos con pavo ({60} g)"],
    ["Salmón ({150} g) al horno con verduras", "Arroz ({40} g en crudo)"],
    ["Cena fuera: 1 ración de proteína (pescado, carne o huevos) y 1 ensalada o verduras", "Si hay copas, cada cubata son unas 240 kcal: compénsalo con menos pan y nada de postre"],
    ["Revuelto de gambas y espárragos (2 huevos)", "Ensalada", "Yogur natural"]
  ]
};
const TIPS = {
  bocadillo: ["Prepara el bocadillo la noche antes y lleva una nevera pequeña si hace calor.", "Pan integral o de centeno; mejor tortitas de maíz si quieres menos hidratos.", "Proteína en cada comida: pollo, atún, huevo, pavo o lomo.", "Agua siempre a mano; la sed en la obra se confunde con hambre."],
  bar: ["Pide la salsa y el aliño aparte.", "Cambia las patatas fritas por ensalada o verdura.", "Un trozo de pan, no la cesta entera.", "Agua, cerveza 0,0 o una caña como mucho."],
  oficina: ["Cocina dos raciones la noche antes: cena y táper del día siguiente.", "Medio plato de verdura, un cuarto de proteína y un cuarto de hidrato.", "Deja la fruta a la vista en la mesa para la media mañana."]
};
function dayMenu(dayIdx, circ, factor){
  const pick = (arr, i) => arr[i % arr.length].map(t => scaleText(t, factor));
  return {
    desayuno: pick(MENU.desayuno, dayIdx),
    media: pick(MENU.media[circ], dayIdx),
    comida: pick(MENU.comida[circ], dayIdx),
    merienda: pick(MENU.merienda, dayIdx),
    cena: pick(MENU.cena, dayIdx)
  };
}
