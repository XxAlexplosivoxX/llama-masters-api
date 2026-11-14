import { createContext, useContext, useSyncExternalStore } from "react";
import { graphsStore, type GraphsState, type GraphsStore } from "../state";

export const GraphsStoreContext = createContext<GraphsStore>(graphsStore);

export function useStore(): GraphsStore {
  return useContext(GraphsStoreContext);
}

export function useGraphsStore<T>(selector: (state: GraphsState) => T): T {
  const store = useContext(GraphsStoreContext);
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
