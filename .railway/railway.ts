import { defineRailway, group, project, service } from "railway/iac";

// Variables are unmanaged: keys, R2 credentials and job args stay in Railway, never in this file.
// Each service picks its Dockerfile through its RAILWAY_DOCKERFILE_PATH variable.
const job = { build: { buildEnvironment: "V3", builder: "RAILPACK" }, replicas: { "us-west2": 1 } } as const;

export default defineRailway(() => {
  const extract = [1, 2, 3, 4].map((k) => service(`extract-${k}`, job)); // one per FIRMS_MAP_KEY_k
  const prepare = service("prepare", job); // runs first: boundaries, cell masks, API split by country
  const process = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => service(`process-${k}`, job)); // clean + aggregate, shard K/8
  const exporter = service("export", job); // runs last: harmonization and the API files

  // `variables` is read by the CLI (5.74) but not yet declared in the SDK types (railway 3.17.0), so the
  // definition goes through a variable: no excess-property error, same object at runtime.
  const definition = {
    variables: { managed: false }, // keep Railway's variables; without this the plan refuses to run
    resources: [group("1 · extract", extract), group("2 · process", [prepare, ...process, exporter])],
  };
  return project("llama-masters-firms", definition);
});
