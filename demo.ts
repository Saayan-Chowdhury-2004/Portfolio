import { OceanEngine, type SharkKind, type SharkSpec } from "./src";

// ?sharks=thresher,hammerhead,mako,nurse — up to 4, each drawn at its real-world scale. No param: the four classics.
const kinds = new URLSearchParams(location.search).get("sharks")?.split(",").filter(Boolean).slice(0, 4) as SharkKind[] | undefined;
const sharks: SharkSpec[] | undefined = kinds?.map((kind) => ({ kind }));

new OceanEngine(document.querySelector("canvas")!, sharks);
