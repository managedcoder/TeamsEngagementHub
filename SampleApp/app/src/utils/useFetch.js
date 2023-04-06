// useFetch.js
import { useEffect, useReducer, useRef } from "react";

const initialState = {
  status: "idle", // "idle" | "loading" | "success" | "error"
  data: null, // any data returned from the API
  error: null, // any error message from the API
};

const reducer = (state, action) => {
  switch (action.type) {
    case "FETCHING":
      return { ...initialState, status: "loading" };
    case "FETCHED":
      return { ...initialState, status: "success", data: action.payload };
    case "FETCH_ERROR":
      return { ...initialState, status: "error", error: action.payload };
    default:
      return state;
  }
};

const useFetch = (url) => {
  const cache = useRef({}); // cache the data in a ref
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    // do nothing if the url is empty
    if (!url) return;

    const fetchData = async () => {
      // check if the data is already cached
      if (cache.current[url]) {
        const data = cache.current[url];
        dispatch({ type: "FETCHED", payload: data });
      } else {
        // otherwise, fetch the data from the API
        dispatch({ type: "FETCHING" });
        try {
          const response = await fetch(url);
          const data = await response.json();
          cache.current[url] = data; // save the data in the cache
          dispatch({ type: "FETCHED", payload: data });
        } catch (error) {
          dispatch({ type: "FETCH_ERROR", payload: error.message });
        }
      }
    };

    fetchData();
  }, [url]);

  return state;
};

export default useFetch;