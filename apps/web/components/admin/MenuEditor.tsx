'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, GripVertical, ImageOff, Plus, Trash2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser-client';
import { logError } from '@/lib/errors';
import { requestMenuRevalidation } from '@/lib/request-menu-revalidation';
import { estaAgotado, siguienteMedianoche } from '@/lib/agotado';
import type { Database } from '@menu-ar/db';

type Category = Database['public']['Tables']['categories']['Row'];
type Dish = Database['public']['Tables']['dishes']['Row'];
type DishChanges = Partial<Pick<Dish, 'name' | 'price_cents' | 'is_available' | 'agotado_hasta'>>;

function DishThumbnail({ src, alt, has3d }: { src: string | null; alt: string; has3d: boolean }) {
  if (!src) {
    return (
      <div
        aria-hidden="true"
        title="Sin foto todavía"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-dashed border-copper-900/50 bg-charcoal-950"
      >
        <ImageOff size={14} strokeWidth={1.75} className="text-stone/40" />
      </div>
    );
  }

  return (
    <div className="relative h-10 w-10 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de 40px, next/image no aporta acá */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full rounded-lg object-cover"
      />
      {has3d ? (
        <span
          title="Tiene modelo 3D publicado"
          className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-copper-600 ring-2 ring-charcoal-900"
        >
          <Box size={9} strokeWidth={2.5} className="text-ink" />
        </span>
      ) : null}
    </div>
  );
}

function DishRow({
  dish,
  has3d,
  thumbnailUrl,
  onUpdate,
  onDelete,
}: {
  dish: Dish;
  has3d: boolean;
  thumbnailUrl: string | null;
  onUpdate: (id: string, changes: DishChanges) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dish.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    // En móvil la fila se parte en dos líneas: con ocho controles en 360 px
    // el nombre del plato se comprimía hasta desaparecer, que es justo el
    // dato por el que uno recorre la lista.
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2.5 transition-colors sm:gap-3 sm:px-3 ${
        dish.is_available
          ? 'border-copper-900/40 bg-charcoal-900 hover:border-copper-700/60'
          : // Un plato fuera de la carta se ve fuera de la carta: sin esto,
            // la única señal es una casilla desmarcada que se pierde entre
            // los demás controles.
            'border-copper-900/25 bg-charcoal-950 opacity-55 hover:opacity-80'
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${dish.name}`}
        className="cursor-grab touch-none rounded-md p-1 text-stone/60 transition-colors hover:bg-charcoal-800 hover:text-cream active:cursor-grabbing"
      >
        <GripVertical size={16} strokeWidth={1.75} />
      </button>

      <DishThumbnail src={thumbnailUrl} alt={dish.name} has3d={has3d} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <input
          defaultValue={dish.name}
          aria-label="Nombre del plato"
          onBlur={(event) => onUpdate(dish.id, { name: event.target.value })}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-cream transition-colors hover:border-copper-900/50 focus:border-copper-500 focus:outline-none"
        />

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 pl-2 sm:pl-0">
          <div className="flex items-center gap-1">
            <span className="text-xs text-stone">$</span>
            <input
              type="number"
              min={0}
              defaultValue={dish.price_cents / 100}
              aria-label="Precio en pesos"
              onBlur={(event) =>
                onUpdate(dish.id, { price_cents: Math.round(Number(event.target.value) * 100) })
              }
              className="w-20 rounded-md border border-copper-900/50 bg-charcoal-950 px-2 py-1 text-right text-sm text-cream transition-colors focus:border-copper-500 focus:outline-none"
            />
          </div>

          {/* "Visible" a secas no decía dónde ni para quién. El texto ahora
              nombra el estado en que queda el plato, no la casilla. */}
          <label
            title={
              dish.is_available
                ? 'El comensal ve este plato al escanear el QR. Desmárcalo para retirarlo sin borrarlo.'
                : 'Este plato no aparece en la carta. Márcalo para volver a mostrarlo.'
            }
            className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-stone"
          >
            <input
              type="checkbox"
              checked={dish.is_available}
              onChange={(event) => onUpdate(dish.id, { is_available: event.target.checked })}
              className="h-3.5 w-3.5 accent-copper-600"
            />
            {dish.is_available ? 'En la carta' : 'Oculto'}
          </label>

          {/* Agotado no es oculto: el plato sigue en la carta con la etiqueta.
              Vence a medianoche para que un olvido no lo deje agotado para
              siempre. Un plato oculto no ofrece la opción: nadie lo ve. */}
          {dish.is_available ? (
            <button
              type="button"
              aria-pressed={estaAgotado(dish.agotado_hasta)}
              title={
                estaAgotado(dish.agotado_hasta)
                  ? 'Se muestra como agotado hasta la medianoche. Tócalo si volvió a haber.'
                  : 'Se sigue viendo en la carta con la etiqueta AGOTADO, y vuelve solo a medianoche.'
              }
              onClick={() =>
                onUpdate(dish.id, {
                  agotado_hasta: estaAgotado(dish.agotado_hasta)
                    ? null
                    : siguienteMedianoche().toISOString(),
                })
              }
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors ${
                estaAgotado(dish.agotado_hasta)
                  ? 'border-warn/60 bg-warn-soft text-warn'
                  : 'border-copper-900/50 text-stone hover:border-copper-500 hover:text-cream'
              }`}
            >
              {estaAgotado(dish.agotado_hasta) ? 'Agotado hoy' : 'Marcar agotado'}
            </button>
          ) : null}
        </div>
      </div>

      <Link
        href={`/admin/menu/${dish.id}`}
        className="shrink-0 rounded-full border border-copper-900/50 px-3 py-1.5 text-xs text-cream transition-colors hover:border-copper-500 hover:bg-charcoal-800"
      >
        Abrir
      </Link>

      <button
        type="button"
        onClick={() => onDelete(dish.id)}
        aria-label={`Eliminar ${dish.name}`}
        className="shrink-0 rounded-md p-1.5 text-stone/60 transition-colors hover:bg-danger-soft hover:text-danger"
      >
        <Trash2 size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function CategorySection({
  category,
  dishes,
  posterByDishId,
  onReorderDishes,
  onUpdateDish,
  onDeleteDish,
  onAddDish,
  onRenameCategory,
  onDeleteCategory,
}: {
  category: Category;
  dishes: Dish[];
  posterByDishId: Record<string, string | null>;
  onReorderDishes: (categoryId: string, reordered: Dish[]) => void;
  onUpdateDish: (id: string, changes: DishChanges) => void;
  onDeleteDish: (id: string) => void;
  onAddDish: (categoryId: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDishDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = dishes.findIndex((dish) => dish.id === active.id);
    const newIndex = dishes.findIndex((dish) => dish.id === over.id);
    onReorderDishes(category.id, arrayMove(dishes, oldIndex, newIndex));
  };

  return (
    <section ref={setNodeRef} style={style}>
      <div className="mb-3 flex items-center gap-2 border-b border-copper-900/30 pb-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar categoría ${category.name}`}
          className="cursor-grab touch-none rounded-md p-1 text-stone/60 transition-colors hover:bg-charcoal-800 hover:text-cream active:cursor-grabbing"
        >
          <GripVertical size={16} strokeWidth={1.75} />
        </button>

        <input
          defaultValue={category.name}
          aria-label="Nombre de la categoría"
          onBlur={(event) => onRenameCategory(category.id, event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-serif text-lg font-semibold tracking-tight text-cream transition-colors hover:border-copper-900/50 focus:border-copper-500 focus:outline-none"
        />

        <span className="shrink-0 text-xs text-stone">
          {dishes.length} {dishes.length === 1 ? 'plato' : 'platos'}
        </span>

        <button
          type="button"
          onClick={() => onDeleteCategory(category.id)}
          aria-label={`Eliminar categoría ${category.name}`}
          className="shrink-0 rounded-md p-1.5 text-stone/60 transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDishDragEnd}>
        <SortableContext items={dishes.map((dish) => dish.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {dishes.map((dish) => (
              <DishRow
                key={dish.id}
                dish={dish}
                has3d={dish.id in posterByDishId}
                // El poster del modelo manda sobre la foto original: es lo
                // que el comensal ve en la carta.
                thumbnailUrl={posterByDishId[dish.id] ?? dish.photo_url}
                onUpdate={onUpdateDish}
                onDelete={onDeleteDish}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {dishes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-copper-900/40 px-4 py-6 text-center text-sm text-stone">
          Sin platos todavía. Agrega el primero para poder darle su modelo 3D.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onAddDish(category.id)}
        className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-stone transition-colors hover:bg-charcoal-900 hover:text-cream"
      >
        <Plus size={15} strokeWidth={2} />
        Agregar plato
      </button>
    </section>
  );
}

export function MenuEditor({
  restaurantId,
  initialCategories,
  initialDishes,
  posterByDishId = {},
}: {
  restaurantId: string;
  initialCategories: Category[];
  initialDishes: Dish[];
  /** Poster del modelo activo, por plato. Estar acá = tener modelo 3D. */
  posterByDishId?: Record<string, string | null>;
}) {
  const [supabase] = useState(() => createBrowserClient());
  const [categories, setCategories] = useState(initialCategories);
  const [dishes, setDishes] = useState(initialDishes);
  const [newCategoryName, setNewCategoryName] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const dishesByCategory = (categoryId: string) =>
    dishes
      .filter((dish) => dish.category_id === categoryId)
      .sort((a, b) => a.position - b.position);

  const with3d = dishes.filter((dish) => dish.id in posterByDishId).length;

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((category) => category.id === active.id);
    const newIndex = categories.findIndex((category) => category.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);
    reordered.forEach((category, index) => {
      if (category.position !== index) {
        void supabase
          .from('categories')
          .update({ position: index })
          .eq('id', category.id)
          .then(({ error }) => {
            if (error) logError('ADMIN_MENU_REORDER_CATEGORY_FAILED', error);
          });
      }
    });
    requestMenuRevalidation();
  };

  const handleReorderDishes = (categoryId: string, reordered: Dish[]) => {
    const reorderedWithPosition = reordered.map((dish, index) => ({ ...dish, position: index }));
    setDishes((prev) => [
      ...prev.filter((dish) => dish.category_id !== categoryId),
      ...reorderedWithPosition,
    ]);
    reorderedWithPosition.forEach((dish, index) => {
      void supabase
        .from('dishes')
        .update({ position: index })
        .eq('id', dish.id)
        .then(({ error }) => {
          if (error) logError('ADMIN_MENU_REORDER_DISH_FAILED', error);
        });
    });
    requestMenuRevalidation();
  };

  const handleUpdateDish = (id: string, changes: DishChanges) => {
    setDishes((prev) => prev.map((dish) => (dish.id === id ? { ...dish, ...changes } : dish)));
    void supabase
      .from('dishes')
      .update(changes)
      .eq('id', id)
      .then(({ error }) => {
        if (error) logError('ADMIN_MENU_UPDATE_DISH_FAILED', error);
      });
    requestMenuRevalidation();
  };

  // Borrar un plato se lleva su modelo 3D por cascade: no es algo que se
  // deshaga desde el panel, así que se confirma antes.
  const handleDeleteDish = (id: string) => {
    const dish = dishes.find((item) => item.id === id);
    if (!dish) return;
    const warning = id in posterByDishId
      ? `Eliminar "${dish.name}" borra también su modelo 3D. No se puede deshacer.`
      : `Eliminar "${dish.name}". No se puede deshacer.`;
    if (!window.confirm(warning)) return;

    setDishes((prev) => prev.filter((item) => item.id !== id));
    void supabase
      .from('dishes')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) logError('ADMIN_MENU_DELETE_DISH_FAILED', error);
      });
    requestMenuRevalidation();
  };

  const handleAddDish = async (categoryId: string) => {
    const position = dishesByCategory(categoryId).length;
    const { data, error } = await supabase
      .from('dishes')
      .insert({
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: 'Plato nuevo',
        price_cents: 0,
        position,
      })
      .select()
      .single();

    if (error) logError('ADMIN_MENU_ADD_DISH_FAILED', error);
    if (data) {
      setDishes((prev) => [...prev, data]);
      requestMenuRevalidation();
    }
  };

  const handleRenameCategory = (id: string, name: string) => {
    setCategories((prev) => prev.map((category) => (category.id === id ? { ...category, name } : category)));
    void supabase
      .from('categories')
      .update({ name })
      .eq('id', id)
      .then(({ error }) => {
        if (error) logError('ADMIN_MENU_RENAME_CATEGORY_FAILED', error);
      });
    requestMenuRevalidation();
  };

  const handleDeleteCategory = (id: string) => {
    const category = categories.find((item) => item.id === id);
    const affected = dishes.filter((dish) => dish.category_id === id).length;
    if (!category) return;
    const warning =
      affected > 0
        ? `Eliminar "${category.name}" borra también sus ${affected} ${affected === 1 ? 'plato' : 'platos'} y sus modelos 3D. No se puede deshacer.`
        : `Eliminar la categoría "${category.name}". No se puede deshacer.`;
    if (!window.confirm(warning)) return;

    setCategories((prev) => prev.filter((item) => item.id !== id));
    setDishes((prev) => prev.filter((dish) => dish.category_id !== id));
    void supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) logError('ADMIN_MENU_DELETE_CATEGORY_FAILED', error);
      });
    requestMenuRevalidation();
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const { data, error } = await supabase
      .from('categories')
      .insert({ restaurant_id: restaurantId, name: newCategoryName.trim(), position: categories.length })
      .select()
      .single();

    if (error) logError('ADMIN_MENU_ADD_CATEGORY_FAILED', error);
    if (data) {
      setCategories((prev) => [...prev, data]);
      setNewCategoryName('');
      requestMenuRevalidation();
    }
  };

  const sortedCategories = categories.slice().sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-cream">Menú</h1>
          <p className="mt-1 text-sm text-stone">
            {dishes.length === 0
              ? 'Todavía no hay platos.'
              : `${dishes.length} ${dishes.length === 1 ? 'plato' : 'platos'} · ${with3d} con modelo 3D`}
          </p>
        </div>
      </header>

      {sortedCategories.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <h2 className="font-serif text-lg font-semibold text-cream">Empieza por una categoría</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone">
            Las categorías agrupan la carta: entradas, platos fuertes, postres. Dentro de cada una
            vas agregando los platos y sus modelos 3D.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
          <SortableContext
            items={sortedCategories.map((category) => category.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-10">
              {sortedCategories.map((category) => (
                <CategorySection
                  key={category.id}
                  category={category}
                  dishes={dishesByCategory(category.id)}
                  posterByDishId={posterByDishId}
                  onReorderDishes={handleReorderDishes}
                  onUpdateDish={handleUpdateDish}
                  onDeleteDish={handleDeleteDish}
                  onAddDish={(categoryId) => void handleAddDish(categoryId)}
                  onRenameCategory={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex gap-2 border-t border-copper-900/30 pt-6">
        <input
          value={newCategoryName}
          onChange={(event) => setNewCategoryName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleAddCategory();
          }}
          placeholder="Nueva categoría"
          aria-label="Nombre de la nueva categoría"
          className="field flex-1"
        />
        <button
          type="button"
          onClick={() => void handleAddCategory()}
          disabled={!newCategoryName.trim()}
          className="btn btn-ghost"
        >
          <Plus size={15} strokeWidth={2} />
          Agregar
        </button>
      </div>
    </div>
  );
}
