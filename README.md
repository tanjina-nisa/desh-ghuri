# Desh Ghuri: Dhaka Street Racer 🏎️🇧🇩

A browser driving game on the **real streets of Dhaka**. You drive a car, bike, bus, truck, CNG, leguna, rickshaw, van or bicycle along the actual road network, with a satellite view, 3D buildings and traffic.

**Live:** https://desh-ghuri.vercel.app

## Features
- **Real roads:** the vehicle stays on the OpenStreetMap road network (OpenFreeMap vector tiles).
  - Lane assist follows each road's curves.
  - Road edges slow you down if you scrape them.
- **Satellite view:** Esri World Imagery, with 3D buildings and asphalt lane markings on top. Press V to switch between satellite and map.
- **Racing camera:** three views — chase, cockpit (steering wheel or bike handlebar) and far. The field of view gets wider as you go faster, with speed lines and a nitro boost.
- **Dhaka traffic:** buses, CNGs, rickshaws, cars and bikes on the road. Collisions are detected.
- **GPS navigation:** routes come from OSRM. Auto-drive follows the route.
- **Famous places:** 24 places, including Lalbagh Fort, Ahsan Manzil, Shaheed Minar, the National Parliament (Sangsad Bhaban) and Hatirjheel.

## Controls
| Key | Action |
|---|---|
| ↑ | Accelerate |
| ↓ | Brake / reverse |
| ← → | Turn |
| Space | Nitro |
| C | Change camera |
| V | Switch satellite / map |
| H | Horn |
| P | Auto-drive |
| M | Full Dhaka map |
| G | Choose destination |

## Tech
Plain HTML/JS with MapLibre GL JS v5 (`calculateCameraOptionsFromTo` gives the street-level camera). It also uses OpenFreeMap, Esri World Imagery and the OSRM demo router.
