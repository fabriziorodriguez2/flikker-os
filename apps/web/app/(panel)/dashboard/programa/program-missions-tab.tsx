"use client";

import { useState } from "react";
import { Pause, Play, Plus, Target, Trash2 } from "lucide-react";
import ProgramSectionHeading from "./program-section-heading";
import MissionEditorModal from "./mission-editor-modal";
import type { ProgramBenefit } from "./types";
import type {
  CreateMissionPayload,
  Mission,
  MissionStatus,
  MissionTemplate,
} from "./mission-types";

const STATUS_LABEL: Record<MissionStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  PAUSED: "En pausa",
  ENDED: "Terminada",
};

const STATUS_STYLE: Record<MissionStatus, string> = {
  DRAFT: "bg-[#F0F1F6] text-[#8891A4]",
  ACTIVE: "bg-[#EAF6EE] text-[#1D9E75]",
  PAUSED: "bg-[#FFF4E5] text-[#B57A1F]",
  ENDED: "bg-[#F0F1F6] text-[#8891A4]",
};

/**
 * Programa → Misiones.
 *
 * Nada de estados vacíos falsos: si el negocio no tiene misiones, se explica
 * qué son y se ofrece crear la primera — no se muestra una tarjeta de ejemplo
 * con números inventados.
 */
export default function ProgramMissionsTab({
  missions,
  templates,
  benefits,
  canMutate,
  onCreate,
  onSetStatus,
  onDelete,
}: {
  missions: Mission[];
  templates: MissionTemplate[];
  benefits: ProgramBenefit[];
  canMutate: boolean;
  onCreate: (payload: CreateMissionPayload) => Promise<void>;
  onSetStatus: (missionId: string, status: MissionStatus) => Promise<void>;
  onDelete: (missionId: string) => Promise<void>;
}) {
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <section className="flex flex-col gap-5">
      <ProgramSectionHeading
        icon={Target}
        title="Misiones"
        description="Dales a tus clientes pequeños objetivos para volver más seguido."
        action={
          canMutate ? (
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4A56A6]"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Nueva misión
            </button>
          ) : null
        }
      />

      {missions.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[#DDE1EC] bg-[#FBFBFE] px-6 py-10 text-center">
          <p className="font-display text-base font-bold text-[#1A202C]">
            Todavía no creaste ninguna misión
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#8891A4]">
            Una misión es un objetivo corto y concreto — &quot;vení 3 veces este
            mes&quot; — que tus clientes ven avanzar cada vez que pasan. Podés
            sumarle un premio de tu catálogo o dejarla sin premio.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((mission) => (
            <li
              key={mission.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-[16px] border border-[#E9EBF3] bg-white px-5 py-4"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-[15px] font-bold text-[#1A202C]">
                    {mission.name}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[mission.status]}`}
                  >
                    {STATUS_LABEL[mission.status]}
                  </span>
                </div>
                <p className="text-sm text-[#8891A4]">
                  {mission.targetVisits}{" "}
                  {mission.targetVisits === 1 ? "visita" : "visitas"} ·{" "}
                  {mission.periodLabel}
                  {mission.rewardName ? (
                    <>
                      {" · Premio: "}
                      <span className="text-[#3A4256]">
                        {mission.rewardName}
                      </span>
                      {mission.rewardHiddenUntilComplete ? " (secreto)" : ""}
                    </>
                  ) : (
                    " · Sin premio"
                  )}
                </p>
                <p className="text-sm text-[#8891A4]">
                  {mission.participantCount === 0
                    ? "Todavía nadie empezó"
                    : `${mission.participantCount} ${
                        mission.participantCount === 1
                          ? "participante"
                          : "participantes"
                      } · ${mission.completedCount} ${
                        mission.completedCount === 1
                          ? "completó"
                          : "completaron"
                      }`}
                </p>
              </div>

              {canMutate && mission.status !== "ENDED" ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {mission.status === "ACTIVE" ? (
                    <button
                      type="button"
                      onClick={() => void onSetStatus(mission.id, "PAUSED")}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#DDE1EC] px-3 text-sm font-semibold text-[#5A6274] transition-colors hover:bg-[#F5F3FF] hover:text-[#5C6BC0]"
                    >
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                      Pausar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onSetStatus(mission.id, "ACTIVE")}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#DDE1EC] px-3 text-sm font-semibold text-[#5A6274] transition-colors hover:bg-[#F5F3FF] hover:text-[#5C6BC0]"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Activar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onDelete(mission.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#DDE1EC] text-[#8891A4] transition-colors hover:border-[#F0C9CD] hover:bg-[#FDF2F3] hover:text-[#C0392B]"
                    aria-label={`Eliminar ${mission.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editorOpen ? (
        <MissionEditorModal
          templates={templates}
          benefits={benefits}
          onClose={() => setEditorOpen(false)}
          onCreate={onCreate}
        />
      ) : null}
    </section>
  );
}
