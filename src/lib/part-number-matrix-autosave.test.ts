
import { expect, it } from "vitest";
import { matrixDraftAfterSave, matrixPayloadNeedsSave, type PartMatrixPayload } from "@/lib/part-number-matrix-contract";
const formal:PartMatrixPayload={partName:"Part",itemKind:"purchased",customSpecification:null,isUniversal:false,
 materialCode:null,materialLabel:null,colorCode:null,colorLabel:null,surfaceTreatment:null,variantNote:null};
it("persists an edit and a revert against the last saved work without a duplicate write",()=>{
 const edit={...formal,variantNote:"temporary"};
 expect(matrixPayloadNeedsSave(edit,formal)).toBe(true);
 const saved=matrixDraftAfterSave(edit,edit,edit);
 expect(matrixPayloadNeedsSave(saved,edit)).toBe(false);
 expect(matrixPayloadNeedsSave(formal,saved)).toBe(true);
 const reverted=matrixDraftAfterSave(formal,formal,formal);
 expect(matrixPayloadNeedsSave(reverted,formal)).toBe(false);
});
it("accepts server normalization without an autosave loop",()=>{
 const submitted={...formal,partName:"  Part  "};
 const settled=matrixDraftAfterSave(submitted,submitted,formal);
 expect(settled).toEqual(formal);expect(matrixPayloadNeedsSave(settled,formal)).toBe(false);
});
it("preserves a newer keystroke for one serialized follow-up save",()=>{
 const submitted={...formal,variantNote:"first"};const newer={...formal,variantNote:"second"};
 const settled=matrixDraftAfterSave(newer,submitted,submitted);
 expect(settled).toEqual(newer);expect(matrixPayloadNeedsSave(settled,submitted)).toBe(true);
 expect(matrixPayloadNeedsSave(matrixDraftAfterSave(newer,newer,newer),newer)).toBe(false);
});
