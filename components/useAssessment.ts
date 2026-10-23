'use client';
import { useEffect, useState, useCallback } from 'react';
import { ASSESSMENT_EVENT, ASSESSMENT_KEY, emptyAssessmentStore, parseAssessmentStore, type AssessmentStore } from '@/lib/assessment';
import { learnerStorageKey } from '@/lib/learner-profiles';
export function useAssessment(profileId: string) {
  const key=learnerStorageKey(ASSESSMENT_KEY,profileId);
  const [loaded,setLoaded]=useState<{key:string;store:AssessmentStore}>({key:'',store:emptyAssessmentStore()});
  const [error,setError]=useState('');
  useEffect(()=>{
    const read=()=>{try{setLoaded({key,store:parseAssessmentStore(localStorage.getItem(key))});}catch{setLoaded({key,store:emptyAssessmentStore()});setError('Assessment storage is unavailable.');}};
    const timer=setTimeout(read,0);window.addEventListener('storage',read);window.addEventListener(ASSESSMENT_EVENT,read);
    return()=>{clearTimeout(timer);window.removeEventListener('storage',read);window.removeEventListener(ASSESSMENT_EVENT,read);};
  },[key]);
  const save=useCallback((store:AssessmentStore)=>{try{localStorage.setItem(key,JSON.stringify(store));setLoaded({key,store});setError('');window.dispatchEvent(new Event(ASSESSMENT_EVENT));return true;}catch{setError('Assessment could not be saved. Free device storage and try again.');return false;}},[key]);
  return {store:loaded.key===key?loaded.store:emptyAssessmentStore(),ready:loaded.key===key,save,error};
}
