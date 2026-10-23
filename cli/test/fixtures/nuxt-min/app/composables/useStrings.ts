import { AR, EN } from "../strings";

/**
 * The words in the visitor's language: the server reads Accept-Language as it renders the page, and the browser keeps
 * what the server chose (useState), so the page hydrates with the same words.
 */
export function useStrings() {
  const arabic = useState("arabic", () => {
    const language = import.meta.server ? (useRequestHeaders(["accept-language"])["accept-language"] ?? "") : navigator.language;
    return language.trim().toLowerCase().startsWith("ar");
  });
  return computed(() => (arabic.value ? AR : EN));
}

/** Arabic reads right to left: the page says so on <html>. */
export function useDirection() {
  const arabic = useState<boolean>("arabic");
  useHead({ htmlAttrs: { lang: () => (arabic.value ? "ar" : "en"), dir: () => (arabic.value ? "rtl" : "ltr") } });
}
