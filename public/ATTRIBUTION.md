# Anatomy data attribution

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- License: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (updated 2025-02-27)
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License terms: https://creativecommons.org/licenses/by/4.0/
- Source geometry: `isa_BP3D_4.0_obj_99.zip`, BodyParts3D 4.0.
- English names and relationships: IS-A and PART-OF concept, element, and inclusion tables from the same archive.
- Publication: Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical concepts. https://doi.org/10.1093/nar/gkn613

Adaptations: axes and units converted from millimeters/Z-up to meters/Y-up; translated to rest at the stage; geometry simplified using meshoptimizer with a 0.2% relative error limit per structure; normals quantized to signed 16-bit; packed into binary chunks; curated display system groupings and colors. The BodyParts3D source contains 2,234 individual OBJ meshes. The skeleton and muscles from that set are replaced by the Z-Anatomy meshes below. 1,536 BodyParts3D meshes remain, covering the organs, vessels, nerves, and the other systems. Original source identity is preserved for those remaining meshes.

## Skeleton, muscles, and joints

Bones, skeletal muscles, and the joint meshes (capsules, ligaments, discs, menisci, and labra) are taken from Z-Anatomy (Gauthier Kervyn and Marcin Zielinski), file `zanatomy.blend`, exported by `scripts/export-zanatomy-systems.py` and installed by `scripts/replace-body-systems.mjs`.

- Model: https://github.com/Z-Anatomy/Models-of-human-anatomy
- Project: https://www.z-anatomy.com/
- Z-Anatomy distributes its code and content under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Its required model attribution is: “BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan” and “Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0”.

These three layers are exported together from that file, with the same axis change (Z-up meters to Y-up meters) and the same 8.4 mm / 10.5 mm translation, and they are not warped afterward. They meet because they were modeled on one skeleton. Origin and insertion markers are omitted. The organs, vessels, and nerves are still the BodyParts3D meshes and can sit about 1–2 cm off this skeleton, because Z-Anatomy repaired the bones.

Adaptations of the Z-Anatomy-derived skeleton, muscle, and joint data—including the browser geometry chunks and rendered images made from them—are distributed under CC BY-SA 4.0. They must retain the required Z-Anatomy and BodyParts3D credits, link to CC BY-SA 4.0, and state these adaptations. The remaining BodyParts3D meshes are CC BY 4.0 and require the BodyParts3D credit above. The application source code remains MIT; it is separate from the model data.

Some source OBJ comments mention the older CC BY-SA 2.1 Japan BodyParts3D licence. The official current BodyParts3D database licence linked above is CC BY 4.0. This does not replace the separate CC BY-SA 4.0 terms that Z-Anatomy applies to its adaptations.

BodyParts3D represents an adult male reference anatomy based on TARO MRI and anatomical illustration refinements. It is not a complete model of every possible human anatomical structure or variation. This interface is educational and is not a clinical tool.

## Historical assets (not included in the current release)

Earlier repository revisions included female reference anatomy: Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, _3D Reference Organ Set for Female v1.5_ (2023). CC BY 4.0. Geometry adapted for this viewer.

- Source DOI: https://doi.org/10.48539/HBM352.BTSQ.586
- Dataset: https://lod.humanatlas.io/ref-organ/united-female/v1.5
- Original GLB: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb
- License: https://creativecommons.org/licenses/by/4.0/

Adaptations: translated native meter/Y-up coordinates onto the stage, coincident vertices welded and source normals averaged, geometry simplified with a 0.2% per-structure relative error bound, and normals quantized. Colors and display systems are curated for this interface. All 888 source meshes are represented, with 1,073 source nodes available as selectable individual or compound concepts.

This is a reference assembly with whole-body surface and selected organs, including female reproductive anatomy. Its skeleton and muscle coverage is partial. It is not a complete model of every human structure or a single-person scan. Eight placenta/umbilical structures are classified under Pregnancy reference and hidden by default.
