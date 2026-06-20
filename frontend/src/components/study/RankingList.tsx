import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { ScenarioOption } from "../../api/study";

type Props = {
  options: ScenarioOption[];
  ranking: string[];
  disabled?: boolean;
  onChange: (ranking: string[]) => void;
};

const moveItem = (items: string[], activeId: string, overId: string) => {
  const from = items.indexOf(activeId);
  const to = items.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const DroppableRankItem = ({
  option,
  rank,
  disabled,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  option: ScenarioOption;
  rank: number;
  disabled?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) => {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: option.id, disabled });
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: option.id,
    disabled,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <li
      ref={(node) => {
        setDropRef(node);
        setDragRef(node);
      }}
      className={`rank-item${isDragging ? " dragging" : ""}${isOver ? " over" : ""}`}
      style={style}
    >
      <div className="rank-number" aria-label={`Rank ${rank}`}>
        {rank}
      </div>
      <button
        type="button"
        className="icon-button drag-handle"
        disabled={disabled}
        aria-label={`Drag ${option.id}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <div className="rank-copy">
        <div className="rank-option-id">Option {option.id}</div>
        <div className="rank-option-label">{option.label}</div>
      </div>
      <div className="rank-move-buttons" aria-label={`Move option ${option.id}`}>
        <button
          type="button"
          className="icon-button"
          onClick={onMoveUp}
          disabled={disabled || !canMoveUp}
          aria-label={`Move option ${option.id} up`}
        >
          <ArrowUp size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onMoveDown}
          disabled={disabled || !canMoveDown}
          aria-label={`Move option ${option.id} down`}
        >
          <ArrowDown size={16} />
        </button>
      </div>
    </li>
  );
};

export const RankingList = ({ options, ranking, disabled, onChange }: Props) => {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const optionById = new Map(options.map((option) => [option.id, option]));
  const ordered = ranking.map((id) => optionById.get(id)).filter(Boolean) as ScenarioOption[];

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId) return;
    onChange(moveItem(ranking, activeId, overId));
  };

  const moveBy = (optionId: string, delta: -1 | 1) => {
    const index = ranking.indexOf(optionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ranking.length) return;
    const next = [...ranking];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <ol className="ranking-list">
        {ordered.map((option, index) => (
          <DroppableRankItem
            key={option.id}
            option={option}
            rank={index + 1}
            disabled={disabled}
            canMoveUp={index > 0}
            canMoveDown={index < ordered.length - 1}
            onMoveUp={() => moveBy(option.id, -1)}
            onMoveDown={() => moveBy(option.id, 1)}
          />
        ))}
      </ol>
    </DndContext>
  );
};
