"use strict";

import { Entity } from "../../src/og/entity/Entity.js";
import { EntityCollection } from "../../src/og/entity/EntityCollection.js";
import { Globe } from "../../src/og/Globe.js";
import { XYZ } from "../../src/og/layer/XYZ.js";
import { GlobusTerrain } from "../../src/og/terrain/GlobusTerrain.js";
import { LonLat } from '../../src/og/LonLat.js';
import * as utils from "../../src/og/utils/shared.js";

let COUNT = 10,
    ENTITY = {},
    ENTITY_OPTIONS = new Map([
        ['farmplane', {
            countRation: 20,
            cb: (options) => {
                options.geoObject.scale = 100;
                options.geoObject.yaw = -50;
                return {
                    ...options,
                    lonlat: [rnd(-180, 180), rnd(-180, 180), 20000]
                };
            }
        }],
        ['landspot', {
            countRation: 100,
            cb: (options) => {
                options.geoObject.scale = 5;
                options.geoObject.yaw = -50;
                return {
                    ...options,
                    lonlat: [rnd(-180, 180), rnd(-180, 180), 0]
                };
            }
        }],
        ['satellite', {
            countRation: 1,
            cb: (options) => {
                return {
                    ...options,
                    lonlat: [rnd(-180, 180), rnd(-180, 180), 2000000]
                };
            }
        }],
        ['airplane', {
            countRation: 80,
            cb: (options) => {
                options.geoObject.yaw = 75;
                return {
                    ...options,
                    lonlat: [rnd(-180, 180), rnd(-180, 180), 20000]
                };
            }
        }]
    ]);

const div = document.createElement('div');
div.style.setProperty('display', 'flex');
div.style.setProperty('flex-direction', 'column');
div.style.setProperty('position', 'absolute');
div.style.setProperty('top', '10px');
div.style.setProperty('left', '10px');
div.style.setProperty('color', 'white');
div.style.setProperty('background', `rgba(0, 0, 0, .7)`);
document.body.appendChild(div);

const span = document.createElement('span');
span.setAttribute('id', 'instance-count');
span.innerText = `Instance count: ${COUNT}`;
div.appendChild(span);

const range = document.createElement('input');
range.setAttribute('type', 'range');
range.setAttribute('min', '1');
range.setAttribute('value', '1');
range.setAttribute('max', '5000');
range.addEventListener('input', () => {
    COUNT = parseInt(range.value);
});
div.appendChild(range);

function rnd(min, max) {
    return Math.random() * (max - min) + min;
}

let globus = new Globe({
    target: "globus",
    name: "Earth",
    layers: [
        new XYZ("OpenStreetMap", {
            isBaseLayer: true,
            url: "//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            visibility: true,
            attribution: "Data @ OpenStreetMap contributors, ODbL"
        })
    ],
    terrain: new GlobusTerrain()
});
let colors = ["red", "orange", "yellow", "green", "lightblue", "darkblue", "purple"];

let geoObjects = new EntityCollection({
    entities: [],
    scaleByDistance: [600000, 24000000, 10000000000]
});

for (const [name, entity_opt] of ENTITY_OPTIONS) {
    fetch(`./${name}.json`)
        .then((response) => {
            return response.json();
        })
        .then((data) => {
            const entities = [];
            const { vertices, indices, normals } = data,
                defaultOptions = (i) => ({
                    name: "sat-" + i,
                    geoObject: {
                        scale: 100000,
                        instanced: true,
                        tag: name,
                        color: colors[i % 7],
                        vertices,
                        indices,
                        normals
                    },
                    'properties': {
                        'color': colors[i % 7]
                    }
                });
            ENTITY[name] = (i) => {
                const o = defaultOptions(i);
                return {
                    ...o,
                    ...(entity_opt && entity_opt.cb ? entity_opt.cb(o, i) : {})
                };
            };

            for (let i = 0; i < COUNT; i++) {
                entities.push(new Entity(ENTITY[name](i)));
            }
            geoObjects.addEntities(entities);
        });
}

geoObjects.events.on("lclick", function (e) {
    e.pickingObject.geoObject.remove();
});

geoObjects.events.on("mouseenter", function (e) {
    let b = e.pickingObject.geoObject;
    b.setColor(1, 1, 1);
});
geoObjects.events.on("mouseleave", function (e) {
    let b = e.pickingObject;
    b.geoObject.setColor4v(utils.htmlColorToRgba(b.properties.color));
});

geoObjects.addTo(globus.planet);

// globus.planet.flyLonLat(new LonLat(0, 0, 2000000));
window.globus = globus;
window.ENTITY_OPTIONS = ENTITY_OPTIONS;

const types = [...ENTITY_OPTIONS.keys()].reduce((acc, name) => {
    return [...acc, ...new Array(ENTITY_OPTIONS.get(name).countRation).fill(name)];
}, []);
globus.planet.events.on("draw", () => {
    const entities = geoObjects._entities;
    if (entities.length > 0) {
        if (entities.length > COUNT) {
            while (entities.length > COUNT) {
                entities[entities.length - 1].remove();
            }
        } else if (entities.length < COUNT) {
            while (entities.length < COUNT) {
                geoObjects.add(new Entity(ENTITY[types[entities.length % (types.length)]](entities.length - 1)));
            }
        }
    }

    if (span && entities.length != span.innerText) {
        span.innerText = `Instance count: ${entities.length}`;
    }

    for (let i = 0; i < entities.length; i++) {
        let e = entities[i],
            c = e.getLonLat();
        switch (e.geoObject.tag) {
            case 'satellite':
                e.setLonLat(new LonLat(c.lon - 0.03, c.lat < -89 ? 90 : c.lat - 0.03, c.height));
                e.geoObject.setYaw(e.geoObject._yaw + 0.1);
                e.geoObject.setPitch(e.geoObject._pitch + 0.1);
                break;
            case 'landspot': break;
            case 'farmplane':
                e.setLonLat(new LonLat(c.lon - 0.01, c.lat > 89 ? -90 : c.lat + 0.01, c.height));
                break;
            default :
                e.setLonLat(new LonLat(c.lon + 0.01, c.lat > 89 ? -90 : c.lat + 0.01, c.height));
                break;

        }
    }
});
