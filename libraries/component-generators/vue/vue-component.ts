import { ComponentAssemblyLine, Builder } from '../pipeline'

import { createPlugin as vueBaseComponent } from '../plugins/vue/vue-base-component'
import { createPlugin as vueStyleComponent } from '../plugins/vue/vue-style-chunk'
import { createPlugin as importStatements } from '../plugins/common/import-statements'

import { GeneratorOptions } from '../pipeline/types'
import { ComponentUIDL } from '../../uidl-definitions/types'

import htmlMapping from '../../uidl-definitions/elements-mapping/html-mapping.json'
import vueMapping from './elements-mapping.json'

const createVueGenerator = (
  { customMapping }: GeneratorOptions = { customMapping: {} }
) => {
  const assemblyLine = new ComponentAssemblyLine(
    [
      vueBaseComponent({
        jsFileId: 'vuejs',
        jsFileAfter: ['libs', 'packs', 'locals'],
        htmlFileId: 'vuehtml',
      }),
      vueStyleComponent({
        styleFileId: 'vuecss',
      }),
      importStatements({
        fileId: 'vuejs',
        importLibsChunkName: 'libs',
        importPackagesChunkName: 'packs',
        importLocalsChunkName: 'locals',
      }),
    ],
    { ...htmlMapping, ...vueMapping, ...customMapping }
  )

  const chunksLinker = new Builder()

  const generateComponent = async (
    jsDoc: ComponentUIDL,
    options: GeneratorOptions = {}
  ) => {
    const result = await assemblyLine.run(jsDoc, options)

    const jsChunks = result.chunks.filter((chunk) => chunk.meta.fileId === 'vuejs')
    const cssChunks = result.chunks.filter((chunk) => chunk.meta.fileId === 'vuecss')
    const htmlChunks = result.chunks.filter((chunk) => chunk.meta.fileId === 'vuehtml')

    const jsCode = chunksLinker.link(jsChunks)
    const cssCode = chunksLinker.link(cssChunks)
    const htmlCode = chunksLinker.link(htmlChunks)

    return {
      code: `
<template>

${htmlCode}
</template>

<script>

${jsCode}
</script>

<style>

${cssCode}

</style>
`,

      dependencies: result.dependencies,
    }
  }

  return generateComponent
}

export default createVueGenerator