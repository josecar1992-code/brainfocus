import { useInfiniteQuery } from "@tanstack/react-query";

// "Cargar más" genérico sobre useInfiniteQuery: cada página trae PAGE_SIZE
// filas (offset/limit, ver resourceRouter.ts), el hook las va acumulando.
// Se corta cuando una página vuelve con menos de PAGE_SIZE filas (esa fue la
// última). El queryKey debe incluir cualquier filtro que cambie el resultado
// (categoría, proyecto, status) — cambiar el filtro arma un queryKey nuevo,
// así que useInfiniteQuery arranca de página 1 sola, sin código extra acá.
export const PAGE_SIZE = 20;

export function usePaginatedList<T>(queryKey: unknown[], fetchPage: (offset: number) => Promise<T[]>) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined),
  });

  const items = (query.data?.pages ?? []).flat();

  return {
    items,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
  };
}
