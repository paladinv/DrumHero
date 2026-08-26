"use client";

import Link from "next/link";
import { useState } from "react";
import { lessons } from "@/lib/curriculum";
import type { Level } from "@/lib/types";
import { useProgress } from "./ProgressProvider";

const filters: Array<"All"|Level> = ["All","Beginner","Intermediate","Advanced"];

export function LessonCatalogue(){
  const [filter,setFilter]=useState<"All"|Level>("All");
  const {progress,completeLesson}=useProgress();
  const visible=filter==="All"?lessons:lessons.filter((lesson)=>lesson.level===filter);
  return <>
    <div className="filters" aria-label="Filter lessons">{filters.map((item)=><button key={item} className={filter===item?"active":""} aria-pressed={filter===item} onClick={()=>setFilter(item)}>{item}</button>)}</div>
    <section className="lesson-list" aria-live="polite">{visible.map((lesson)=>{
      const done=progress.completedLessons.includes(lesson.id);
      return <article className={`lesson level-${lesson.level}`} key={lesson.id}>
        <span className="lesson-order" aria-label={`Lesson ${lesson.order}`}>{String(lesson.order).padStart(2,"0")}</span>
        <div className="lesson-copy"><span className="level-mark">{lesson.level} · {lesson.duration} min</span><h3>{lesson.title}</h3><p>{lesson.summary}</p><div className="goals">{lesson.goals.map((goal)=><span key={goal}>✓ {goal}</span>)}</div></div>
        <div className="lesson-actions">{done?<span className="done-mark">Completed</span>:null}{lesson.practicePatternId?<Link className="button-secondary" href={`/practice?pattern=${lesson.practicePatternId}`}>Practice</Link>:null}<button className="button" disabled={done} onClick={()=>completeLesson(lesson.id)}>{done?"Done":"Mark complete"}</button></div>
      </article>})}</section>
  </>;
}

