'use client';
import { useEffect, useState, useCallback } from 'react';
import { ASSESSMENT_DRAFT_KEY, ASSESSMENT_EVENT, ASSESSMENT_KEY, emptyAssessmentStore, parseAssessmentDraft, parseAssessmentStore, serializeAssessmentDraft, type AssessmentResult, type AssessmentStore } from '@/lib/assessment';
import { learnerStorageKey } from '@/lib/learner-profiles';
export function useAssessment(profileId: string) {
  const key=learnerStorageKey(ASSESSMENT_KEY,profileId);
  const draftKey=learnerStorageKey(ASSESSMENT_DRAFT_KEY,profileId);
  const [loaded,setLoaded]=useState<{key:string;store:AssessmentStore;draft:AssessmentResult|null}>({key:'',store:emptyAssessmentStore(),draft:null});
  const [error,setError]=useState('');
  useEffect(()=>{
    const read=()=>{try{setLoaded({key,store:parseAssessmentStore(localStorage.getItem(key)),draft:parseAssessmentDraft(localStorage.getItem(draftKey))});}catch{setLoaded({key,store:emptyAssessmentStore(),draft:null});setError('Assessment storage is unavailable.');}};
    const timer=setTimeout(read,0);window.addEventListener('storage',read);window.addEventListener(ASSESSMENT_EVENT,read);
    return()=>{clearTimeout(timer);window.removeEventListener('storage',read);window.removeEventListener(ASSESSMENT_EVENT,read);};
  },[key,draftKey]);
  const save=useCallback((store:AssessmentStore)=>{try{localStorage.setItem(key,JSON.stringify(store));setLoaded(current=>current.key===key?{...current,store}:{key,store,draft:null});setError('');window.dispatchEvent(new Event(ASSESSMENT_EVENT));return true;}catch{setError('Assessment could not be saved. Free device storage and try again.');return false;}},[key]);
  const saveDraft=useCallback((result:AssessmentResult)=>{try{const draft=parseAssessmentDraft(serializeAssessmentDraft(result));if(!draft)return false;localStorage.setItem(draftKey,serializeAssessmentDraft(result));setLoaded(current=>current.key===key?{...current,draft:result}:current);return true;}catch{setError('Assessment checkpoint could not be saved.');return false;}},[draftKey,key]);
  const clearDraft=useCallback(()=>{try{localStorage.removeItem(draftKey);setLoaded(current=>current.key===key?{...current,draft:null}:current);}catch{setError('Assessment checkpoint could not be cleared.');}},[draftKey,key]);
  return {store:loaded.key===key?loaded.store:emptyAssessmentStore(),draft:loaded.key===key?loaded.draft:null,ready:loaded.key===key,save,saveDraft,clearDraft,error};
}
